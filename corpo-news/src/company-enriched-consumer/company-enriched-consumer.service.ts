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
  subjectForReady,
} from 'contract/company.contract';
import { PrismaService } from 'src/prisma/prisma.service';
import { NatsJetStreamService } from '@app/nats-jet-stream';
import { ConsumerMessages, JsMsg } from '@nats-io/jetstream';
import { Prisma } from 'generated/prisma';
import { OutboxService } from 'src/outbox/outbox.service';

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
        };

        await this.outbox.enqueue(trans, 'company.ready', companyReadyEvent);
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
}
