import { Module } from '@nestjs/common';
import { OutboxService } from './outbox.service';
import { PrismaModule } from '../prisma/prisma.module';
import { NatsJetStreamModule } from '@app/nats-jet-stream';
import { OutboxPublisher } from './outbox.processor';

@Module({
  imports: [PrismaModule, NatsJetStreamModule],
  providers: [OutboxService, OutboxPublisher],
  exports: [OutboxService],
})
export class OutboxModule {}
