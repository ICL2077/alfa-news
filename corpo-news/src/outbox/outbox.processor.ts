import { Injectable, Logger } from '@nestjs/common';
import { Interval } from '@nestjs/schedule';
import { NatsJetStreamService } from '@app/nats-jet-stream';
import { subjectForEnrich, subjectForReady } from 'contract/company.contract';
import { subjectForRawNews } from 'contract/news.contract';
import { PrismaService } from 'src/prisma/prisma.service';
import { subjectForChatRequest } from 'contract/chat.contract';

function subjectByType(type: string, payload: any) {
  const subjects = {
    'company.enrich': subjectForEnrich(payload.companyId),
    'company.ready': subjectForReady(payload.companyId),
    'news.raw': subjectForRawNews(payload.id),
    'chat.request': subjectForChatRequest(payload.chatId, payload.messageId),
  };

  return subjects[type];
}

const MAX_ATTEMPTS = 5;

@Injectable()
export class OutboxPublisher {
  private readonly logger = new Logger(OutboxPublisher.name);
  private running = false;

  constructor(
    private prisma: PrismaService,
    private JSService: NatsJetStreamService,
  ) {}

  @Interval(1_000)
  async tick() {
    if (this.running) return; // защита от наложения тиков в одном процессе
    this.running = true;
    try {
      const events = await this.prisma.outboxEvent.findMany({
        where: { sentAt: null, attempts: { lt: MAX_ATTEMPTS } },
        orderBy: { createdAt: 'asc' },
        take: 50,
      });

      for (const ev of events) {
        try {
          const subject = subjectByType(ev.type, ev.payload);
          if (!subject) throw new Error(`unknown outbox type: ${ev.type}`);
          await this.JSService.publishMessage(subject, ev.payload, ev.id);
          this.logger.debug(`succesfully published`);
          await this.prisma.outboxEvent.update({
            where: { id: ev.id },
            data: { sentAt: new Date(), lastError: null },
          });
        } catch (err) {
          await this.prisma.outboxEvent.update({
            where: { id: ev.id },
            data: {
              attempts: { increment: 1 },
              lastError: (err as Error).message.slice(0, 500),
            },
          });
          this.logger.warn(
            `outbox publish failed id=${ev.id} type=${ev.type}: ${(err as Error).message}`,
          );
        }
      }
    } finally {
      this.running = false;
    }
  }
}
