import { Injectable } from '@nestjs/common';
import { Prisma } from '../../generated/prisma';

@Injectable()
export class OutboxService {
  async enqueue(
    trans: Prisma.TransactionClient,
    type: string,
    payload: object,
  ) {
    await trans.outboxEvent.create({ data: { type, payload: payload as any } });
  }

  /** Пакетная вставка: одним запросом вместо N create */
  async enqueueMany(
    trans: Prisma.TransactionClient,
    type: string,
    payloads: object[],
  ) {
    if (payloads.length === 0) return;
    await trans.outboxEvent.createMany({
      data: payloads.map((payload) => ({ type, payload: payload as any })),
    });
  }
}
