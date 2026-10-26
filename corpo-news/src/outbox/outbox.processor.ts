import { Injectable, Logger } from '@nestjs/common';
import { Interval } from '@nestjs/schedule';
import { NatsJetStreamService } from '@app/nats-jet-stream';
import { subjectForEnrich, subjectForReady } from 'contract/company.contract';
import {
  subjectForBacklogNews,
  subjectForRawNews,
} from 'contract/news.contract';
import { PrismaService } from 'src/prisma/prisma.service';
import { subjectForChatRequest } from 'contract/chat.contract';

function subjectBuilders(type: string, payload: any): string | undefined {
  // switch вместо объекта: subject строится только для нужного типа,
  // у остальных событий нет полей вроде payload.companyId
  switch (type) {
    case 'company.enrich':
      return subjectForEnrich(payload.companyId);
    case 'company.ready':
      return subjectForReady(payload.companyId);
    case 'news.raw':
      return subjectForRawNews(payload.id);
    case 'news.backlog':
      return subjectForBacklogNews(payload.companyId, payload.id);
    case 'chat.request':
      return subjectForChatRequest(payload.chatId, payload.messageId);
    default:
      return undefined;
  }
}

interface Claimed {
  id: string;
  type: string;
  payload: unknown;
  attempts: number;
}

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
      for (let i = 0; i < 20; i++) {
        const [ev] = await this.claim();
        if (!ev) break;
        try {
          const subject = subjectBuilders(ev.type, ev.payload);
          if (!subject) throw new Error(`unknown outbox type: ${ev.type}`);

          await this.JSService.publishMessage(subject, ev.payload, ev.id);
          this.logger.debug(`succesfully published`);
          await this.prisma.outboxEvent.update({
            where: { id: ev.id },
            data: { sentAt: new Date(), lastError: null },
          });
        } catch (err) {
          await this.scheduleRetry(ev, err.message);
          this.logger.warn(
            `outbox publish failed id=${ev.id} type=${ev.type}: ${(err as Error).message}`,
          );
        }
      }
    } finally {
      this.running = false;
    }
  }

  // функция берет сообщения и бронирует их для себя (своего инстанса) так чтобы другие инстансы с такой же функцией не могли взять
  // одно и то же сообщение
  private async claim(): Promise<Claimed[]> {
    const candidates = await this.prisma.outboxEvent.findMany({
      // берем еще не отправленные в JS сообщения и у которых наступило время попытки (меньше или равно сейчас)
      where: { sentAt: null, nextAttemptAt: { lte: new Date() } },
      orderBy: { createdAt: 'asc' },
      take: 1,
    });

    const claimed: Claimed[] = [];

    for (const event of candidates) {
      const res = await this.prisma.outboxEvent.updateMany({
        where: {
          id: event.id,
          sentAt: null,
          nextAttemptAt: event.nextAttemptAt,
        },
        data: {
          nextAttemptAt: new Date(Date.now() + 30_000), // добавляем 30 секунд к таймеру для того чтобы другой инстанс обрабатывая блок where не получил текущий event - это и есть наше бронирование
          attempts: { increment: 1 },
        },
      });

      if (res.count === 1) {
        claimed.push({
          id: event.id,
          type: event.type,
          payload: event.payload,
          attempts: event.attempts + 1,
        });
      }
    }

    return claimed;
  }

  private async scheduleRetry(ev: Claimed, error: string) {
    const delaySec = Math.min(2 ** ev.attempts, 60);
    const message = error.slice(0, 500);

    await this.prisma.outboxEvent.update({
      where: { id: ev.id },
      data: {
        lastError: message,
        nextAttemptAt: new Date(Date.now() + delaySec * 1000), // отдаляем чуть чуть дальше сообщение чтобы снова попробовать его обработать
      },
    });

    this.logger.warn(
      `outbox publish failed id=${ev.id} attempt=${ev.attempts}`,
    );
  }
}
