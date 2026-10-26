import {
  Injectable,
  Logger,
  OnApplicationBootstrap,
  OnModuleDestroy,
} from '@nestjs/common';
import {
  CompanyEnrichedEvent,
  CompanyReadyEvent,
  companyStream,
} from 'contract/company.contract';
import { NewsBacklogEvent } from 'contract/news.contract';
import { PrismaService } from 'src/prisma/prisma.service';
import { NatsJetStreamService } from '@app/nats-jet-stream';
import { ConsumerMessages, JsMsg } from '@nats-io/jetstream';
import { Prisma } from 'generated/prisma';
import { OutboxService } from 'src/outbox/outbox.service';

/** За сколько дней берём архивные новости для новой компании */
const BACKLOG_DAYS = 7;
/** Максимум архивных новостей на одну компанию (защита от огромной пачки в outbox) */
const BACKLOG_MAX_ARTICLES = 1000;

@Injectable()
export class CompanyEnrichedConsumerService
  implements OnApplicationBootstrap, OnModuleDestroy
{
  private logger = new Logger(CompanyEnrichedConsumerService.name);
  private messages: ConsumerMessages;

  constructor(
    private prisma: PrismaService,
    private JSService: NatsJetStreamService,
    private outbox: OutboxService,
  ) {}

  async onApplicationBootstrap() {
    const consumer = await this.JSService.JSClient.consumers.get(
      companyStream.name,
      companyStream.consumers.nestEnriched,
    );

    this.messages = await consumer.consume({ max_messages: 20 });

    void this.processMsgs();
  }

  onModuleDestroy() {
    this.messages.stop();
  }

  async processMsgs() {
    for await (const msg of this.messages) {
      await this.handleMessage(msg);
    }
  }

  async handleMessage(msg: JsMsg) {
    let event: CompanyEnrichedEvent;
    try {
      event = msg.json<CompanyEnrichedEvent>();
    } catch {
      return msg.term();
    }

    try {
      await this.prisma.$transaction(async (trans) => {
        await trans.$queryRaw`SELECT id FROM "companies" WHERE id = ${event.companyId} FOR UPDATE`;
        // статус до обновления: бэклог нужен только при первом переходе в READY
        const prev = await trans.company.findUniqueOrThrow({
          where: { id: event.companyId },
          select: { status: true },
        });

        const company = await trans.company.update({
          where: { id: event.companyId },
          data: {
            status: 'READY',
            keywords: event.keywords,
            updatedAt: event.enrichedAt,
            profileJson: (event.profileJson ??
              Prisma.JsonNull) as Prisma.InputJsonValue,
          },
        });

        const companyReadyEvent: CompanyReadyEvent = {
          companyId: company.id,
          keywords: company.keywords,
          name: company.name,
          description: company.description,
          region: company.region,
          profileJson: company.profileJson,
          updatedAt: company.updatedAt.toISOString(),
          bankClientId: company.bankClientId,
        };

        await this.outbox.enqueue(trans, 'company.ready', companyReadyEvent);

        if (prev.status !== 'READY') {
          await this.enqueueBacklog(trans, company.id);
        }
      });

      return msg.ack();
    } catch (error) {
      if (error?.code === 'P2025') {
        this.logger.warn(`Dropped ${msg.subject}: company not found`);
        return msg.term();
      }
      this.logger.error(`Enriched handler failed: ${error.message}`);
      return msg.nak();
    }
  }

  /**
   * Кладёт в outbox архивные новости за последние BACKLOG_DAYS дней,
   * чтобы Python оценил их для только что готовой компании.
   * Выполняется в той же транзакции, что и company.ready.
   */
  private async enqueueBacklog(
    trans: Prisma.TransactionClient,
    companyId: string,
  ) {
    const since = new Date(Date.now() - BACKLOG_DAYS * 24 * 3600 * 1000);

    const articles = await trans.rawArticle.findMany({
      where: { pubDate: { gte: since } },
      orderBy: { pubDate: 'desc' },
      take: BACKLOG_MAX_ARTICLES,
    });

    if (articles.length === 0) return;

    const publishedAt = new Date().toISOString();
    const events = articles.map((a): NewsBacklogEvent => ({
      id: a.id,
      guid: a.guid,
      title: a.title,
      description: a.description,
      fullText: a.fullText,
      link: a.link,
      category: a.category,
      pubDate: a.pubDate.toISOString(),
      publishedAt,
      companyId,
    }));

    await this.outbox.enqueueMany(trans, 'news.backlog', events);
    this.logger.log(
      `Backlog for company ${companyId}: ${events.length} articles queued`,
    );
  }
}
