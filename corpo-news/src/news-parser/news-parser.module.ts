import { Module } from '@nestjs/common';
import { NewsParserService } from './news-parser.service';
import { PrismaModule } from 'src/prisma/prisma.module';
import { NewsParserController } from './news-parser.controller';
import { OutboxModule } from 'src/outbox/outbox.module';

@Module({
  imports: [PrismaModule, OutboxModule],
  providers: [NewsParserService],
  exports: [NewsParserService],
  controllers: [NewsParserController],
})
export class NewsParserModule {}
