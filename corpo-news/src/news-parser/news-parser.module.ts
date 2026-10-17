import { Module } from '@nestjs/common';
import { NewsParserService } from './news-parser.service';
import { PrismaModule } from 'src/prisma/prisma.module';

@Module({
  imports: [PrismaModule],
  providers: [NewsParserService],
  exports: [NewsParserService],
})
export class NewsParserModule {}
