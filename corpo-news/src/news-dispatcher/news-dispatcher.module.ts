import { Module } from '@nestjs/common';
import { NewsDispatcherService } from './news-dispatcher.service';
import { NewsParserModule } from 'src/news-parser/news-parser.module';
import { NewsDispatcherController } from './news-dispatcher.controller';
import { NatsJetStreamModule } from '@app/nats-jet-stream';
import { PrismaModule } from 'src/prisma/prisma.module';

@Module({
  imports: [NewsParserModule, NatsJetStreamModule, PrismaModule],
  providers: [NewsDispatcherService],
  controllers: [NewsDispatcherController],
})
export class NewsDispatcherModule {}
