import { Module } from '@nestjs/common';
import { CompanyService } from './company.service';
import { CompanyController } from './company.controller';
import { NatsJetStreamModule } from '@app/nats-jet-stream';
import { PrismaModule } from 'src/prisma/prisma.module';
import { OutboxModule } from 'src/outbox/outbox.module';

@Module({
  imports: [PrismaModule, NatsJetStreamModule, OutboxModule],
  providers: [CompanyService],
  controllers: [CompanyController],
})
export class CompanyModule {}
