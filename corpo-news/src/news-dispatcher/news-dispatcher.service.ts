import { NatsJetStreamService } from '@app/nats-jet-stream';
import { Injectable, Logger, OnApplicationBootstrap } from '@nestjs/common';
import { NewsParserService } from 'src/news-parser/news-parser.service';
import { Cron, CronExpression } from '@nestjs/schedule';
import {
  NewsRawEvent,
  newsStream,
  subjectForRawNews,
} from '../../contract/news.contract';
import { PrismaService } from 'src/prisma/prisma.service';

@Injectable()
export class NewsDispatcherService implements OnApplicationBootstrap {
  private logger = new Logger(NewsDispatcherService.name);

  private isRunning: boolean = false;

  constructor(
    private newsService: NewsParserService,
    private JSService: NatsJetStreamService,
    private prisma: PrismaService,
  ) {}

  async onApplicationBootstrap() {
    try {
      await this.JSService.ensureMessagesStream(
        newsStream.name,
        newsStream.subjects.coreSubject,
      );

      await this.JSService.ensureMessagesConsumer(
        newsStream.name,
        newsStream.consumers.nestNewsConsumer, // nest консьюмер
        newsStream.subjects.nestConsumerSubject,
      );

      await this.JSService.ensureMessagesConsumer(
        newsStream.name,
        newsStream.consumers.mlNewsConsumer, // python консьюмер
        newsStream.subjects.mlConsumerSubject,
      );
    } catch (error) {
      this.logger.error(`Nats bootstrap failed: ${error.message}`);
    }
  }

  @Cron(CronExpression.EVERY_10_MINUTES)
  async processNews() {
    if (this.isRunning) return;
    this.isRunning = true;

    try {
      await this.newsService.fetchAndStore();

      const articles = await this.prisma.rawArticle.findMany({
        where: { sendToStream: false },
        orderBy: { pubDate: 'asc' },
        take: 30,
      });

      if (articles.length === 0) return;

      for (const article of articles) {
        try {
          const event: NewsRawEvent = {
            id: article.id,
            guid: article.guid,
            title: article.title,
            description: article.description,
            fullText: article.fullText,
            link: article.link,
            category: article.category,
            pubDate: article.pubDate.toISOString(),
            publishedAt: new Date().toISOString(),
          };

          await this.JSService.publishMessage(
            subjectForRawNews(article.id),
            event,
            article.id,
          );

          await this.prisma.rawArticle.update({
            where: { id: article.id },
            data: { sendToStream: true },
          });
        } catch (error) {
          this.logger.error(
            `Publish failed for ${article.id}: ${error.message}`,
          );
        }
      }
    } catch (error) {
      this.logger.error(`Publish process failed: ${error.message}`);
    } finally {
      this.isRunning = false;
    }
  }
}
