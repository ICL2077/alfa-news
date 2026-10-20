import { NatsJetStreamService } from '@app/nats-jet-stream';
import { ConsumerMessages, JsMsg } from '@nats-io/jetstream';
import {
  Injectable,
  Logger,
  OnApplicationBootstrap,
  OnModuleDestroy,
} from '@nestjs/common';
import { NewsProcessedEvent, newsStream } from 'contract/news.contract';
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
      Number.isNaN(event.score)
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
      score: event.score,
      category: event.category ?? null,
      impact: event.impact ?? null,
      horizon: event.horizon ?? null,
      summary: event.summary ?? null,
      explanation: event.explanation ?? null,
    };

    await this.prisma.articleMatch.upsert({
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
  }
}
