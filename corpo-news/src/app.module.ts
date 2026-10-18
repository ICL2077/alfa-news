import { Module } from '@nestjs/common';
import { NewsParserModule } from './news-parser/news-parser.module';
import { PrismaModule } from './prisma/prisma.module';
import { NewsDispatcherModule } from './news-dispatcher/news-dispatcher.module';
import { ConfigModule } from '@nestjs/config';
import { CompanyModule } from './company/company.module';
import { NewsProcessedModule } from './news-processed-consumer/news-processed.module';
import { CompanyEnrichedConsumerModule } from './company-enriched-consumer/company-enriched-consumer.module';
import { NatsBootstrapModule } from './nats-bootstrap/nats-bootstrap.module';

@Module({
  imports: [
    NewsParserModule,
    PrismaModule,
    NewsDispatcherModule,
    ConfigModule.forRoot({ envFilePath: '../.env', isGlobal: true }),
    CompanyModule,
    NewsProcessedModule,
    CompanyEnrichedConsumerModule,
    NatsBootstrapModule,
  ],
  controllers: [],
  providers: [],
})
export class AppModule {}
