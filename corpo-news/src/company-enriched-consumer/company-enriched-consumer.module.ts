import { Module } from '@nestjs/common';
import { CompanyEnrichedConsumerService } from './company-enriched-consumer.service';
import { PrismaModule } from 'src/prisma/prisma.module';
import { NatsJetStreamModule } from '@app/nats-jet-stream';
import { OutboxModule } from 'src/outbox/outbox.module';

@Module({
  providers: [CompanyEnrichedConsumerService],
  imports: [PrismaModule, NatsJetStreamModule, OutboxModule],
})
export class CompanyEnrichedConsumerModule {}
