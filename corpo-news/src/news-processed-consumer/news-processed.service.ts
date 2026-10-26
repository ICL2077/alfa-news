import { NatsJetStreamService } from '@app/nats-jet-stream';
import { ConsumerMessages, JsMsg } from '@nats-io/jetstream';
import {
  Injectable,
  Logger,
  OnApplicationBootstrap,
  OnModuleDestroy,
} from '@nestjs/common';
import { NewsProcessedEvent, newsStream } from 'contract/news.contract';
import { isAgentTrace } from 'contract/agent.contract';
import { Prisma } from 'generated/prisma';
import { PrismaService } from 'src/prisma/prisma.service';

@Injectable()
export class NewsProcessedService
  implements OnApplicationBootstrap, OnModuleDestroy
{
  private messages: ConsumerMessages;
  private logger = new Logger(NewsProcessedService.name);

  constructor(
    private JSService: NatsJetStreamService,
    private prisma: PrismaService,
  ) {}

  async onApplicationBootstrap() {
    const consumer = await this.JSService.JSClient.consumers.get(
      newsStream.name,
      newsStream.consumers.nestNewsConsumer,
    );

    this.messages = await consumer.consume({ max_messages: 100 });
    void this.processMsgs();
  }

  onModuleDestroy() {
    this.messages.stop();
  }

  async processMsgs() {
    for await (const msg of this.messages) {
      await this.handleMsg(msg);
    }
  }

  async handleMsg(msg: JsMsg) {
    let event: NewsProcessedEvent;
    try {
      event = msg.json<NewsProcessedEvent>();
    } catch {
      return msg.term();
    }

    if (
      !event?.articleId ||
      !event?.companyId ||
      typeof event.score !== 'number' ||
      !Number.isFinite(event.score) ||
      event.score < 0 ||
      event.score > 1 ||
      typeof event.summary !== 'string' ||
      typeof event.explanation !== 'string' ||
      (event.impact != null &&
        !['negative', 'positive', 'mixed', 'neutral'].includes(event.impact)) ||
      (event.horizon != null &&
        !['short', 'medium', 'long'].includes(event.horizon)) ||
      (event.actions != null &&
        (!Array.isArray(event.actions) ||
          event.actions.length > 3 ||
          event.actions.some((x) => typeof x !== 'string'))) ||
      (event.alfaView != null && typeof event.alfaView !== 'string') ||
      (event.sources != null &&
        (!Array.isArray(event.sources) ||
          event.sources.length > 20 ||
          event.sources.some(
            (x) =>
              !x ||
              !['news', 'alfa'].includes(x.type) ||
              typeof x.ref !== 'string' ||
              (x.type === 'alfa' &&
                (!Number.isInteger(x.page) ||
                  x.page! < 1 ||
                  typeof x.quote !== 'string' ||
                  x.quote.length < 20)),
          ))) ||
      (event.trace != null && !isAgentTrace(event.trace))
    ) {
      this.logger.warn(`Invalid event on ${msg.subject}`);
      return msg.term();
    }

    try {
      await this.upsertToDb(event);
      return msg.ack();
    } catch (error) {
      if (error?.code === 'P2003') {
        this.logger.warn(`Dropped ${msg.subject}: unknown article/company`);
        return msg.term();
      }
      this.logger.error(`Upsert failed on ${msg.subject}: ${error.message}`);
      return msg.nak(5000);
    }
  }

  async upsertToDb(event: NewsProcessedEvent) {
    const data = {
      actions: event.actions ?? [],
      alfaView: event.sources?.some((x) => x.type === 'alfa')
        ? (event.alfaView ?? null)
        : null,
      sources: (event.sources ?? []) as unknown as Prisma.InputJsonValue,
      score: event.score,
      category: event.category ?? null,
      impact: event.impact ?? null,
      horizon: event.horizon ?? null,
      summary: event.summary ?? null,
      explanation: event.explanation ?? null,
    };

    await this.prisma.$transaction(async (trans) => {
      const match = await trans.articleMatch.upsert({
        where: {
          rawArticleId_companyId: {
            rawArticleId: event.articleId,
            companyId: event.companyId,
          },
        },
        create: {
          rawArticleId: event.articleId,
          companyId: event.companyId,
          ...data,
        },
        update: data,
      });

      if (event.trace) {
        await trans.agentRun.upsert({
          where: { articleMatchId: match.id },
          create: {
            kind: 'NEWS_MATCH',
            articleMatchId: match.id,
            model: event.model ?? null,
            durationMs: event.trace.durationMs,
            steps: event.trace.steps as unknown as Prisma.InputJsonValue,
          },
          update: {
            model: event.model ?? null,
            durationMs: event.trace.durationMs,
            steps: event.trace.steps as unknown as Prisma.InputJsonValue,
          },
        });
      }

      return match;
    });
  }
}
