import { Module } from '@nestjs/common';
import { NewsProcessedService } from './news-processed.service';
import { NatsJetStreamModule } from '@app/nats-jet-stream';
import { PrismaModule } from 'src/prisma/prisma.module';

@Module({
  imports: [PrismaModule, NatsJetStreamModule],
  providers: [NewsProcessedService],
})
export class NewsProcessedModule {}
