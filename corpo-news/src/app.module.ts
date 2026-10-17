import { Module } from '@nestjs/common';
import { NewsParserModule } from './news-parser/news-parser.module';
import { PrismaModule } from './prisma/prisma.module';
import { NewsDispatcherModule } from './news-dispatcher/news-dispatcher.module';
import { ConfigModule } from '@nestjs/config';

@Module({
  imports: [
    NewsParserModule,
    PrismaModule,
    NewsDispatcherModule,
    ConfigModule.forRoot({ envFilePath: '../.env', isGlobal: true }),
  ],
  controllers: [],
  providers: [],
})
export class AppModule {}
