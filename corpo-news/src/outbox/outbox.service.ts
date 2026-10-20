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
}
