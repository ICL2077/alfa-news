import { Module } from '@nestjs/common';
import { CompanyEnrichedConsumerService } from './company-enriched-consumer.service';
import { PrismaModule } from 'src/prisma/prisma.module';
import { NatsJetStreamModule } from '@app/nats-jet-stream';

@Module({
  providers: [CompanyEnrichedConsumerService],
  imports: [PrismaModule, NatsJetStreamModule],
})
export class CompanyEnrichedConsumerModule {}
