import { Injectable } from '@nestjs/common';
import { PrismaService } from 'src/prisma/prisma.service';
import axios from 'axios';

import { XMLParser } from 'fast-xml-parser';
import { NewsRawEvent } from 'contract/news.contract';
import { OutboxService } from 'src/outbox/outbox.service';
import { Cron, CronExpression } from '@nestjs/schedule';

const API_RSS_URL = 'https://rssexport.rbc.ru/rbcnews/news/30/full.rss';

@Injectable()
export class NewsParserService {
  private parser = new XMLParser({
    ignoreAttributes: false,
    attributeNamePrefix: '@_',
    cdataPropName: '__cdata',
    trimValues: true,
  });

  constructor(
    private prisma: PrismaService,
    private outbox: OutboxService,
  ) {}

  @Cron(CronExpression.EVERY_5_MINUTES)
  async fetchAndStore() {
    const xml = await this.fetchXml(API_RSS_URL);
    const articles = this.parseRbcXml(xml);

    if (articles.length === 0) {
      return [];
    }

    return await this.prisma.$transaction(async (trans) => {
      const res = await trans.rawArticle.createManyAndReturn({
        data: articles,
        skipDuplicates: true,
      });

      const publishedAt = new Date().toISOString();

      for (const article of res) {
        const event: NewsRawEvent = {
          id: article.id,
          guid: article.guid,
          title: article.title,
          description: article.description,
          fullText: article.fullText,
          link: article.link,
          category: article.category,
          pubDate: article.pubDate.toISOString(),
          publishedAt: publishedAt,
        };

        await this.outbox.enqueue(trans, 'news.raw', event);
      }

      return res;
    });
  }

  private async fetchXml(url: string): Promise<string> {
    try {
      const { data } = await axios.get<string>(url, {
        headers: { 'User-Agent': 'Mozilla/5.0 (compatible; NewsBot/1.0)' },
        timeout: 10_000,
        responseType: 'text',
      });
      return data;
    } catch (error) {
      if (axios.isAxiosError(error)) {
        throw new Error(
          `fetch failed: status=${error.response?.status} code=${error.code} msg=${error.message}`,
          { cause: error },
        );
      }
      throw error;
    }
  }

  private parseRbcXml(xml: string) {
    const parsed = this.parser.parse(xml);
    const items = parsed?.rss?.channel?.item;

    if (!items) return [];

    // апи может отдать как один item так и массив, нормализируем
    const list = Array.isArray(items) ? items : [items];

    return list
      .map((item: any) => this.normalizeItem(item))
      .filter((a): a is NonNullable<typeof a> => a !== null);
  }

  private normalizeItem(item: any) {
    const guid = this.extractText(item.guid);
    const title = this.extractText(item.title);
    const link = this.extractText(item.link);
    const pubDate = this.extractText(item.pubDate);

    if (!guid || !title || !link || !pubDate) {
      return null;
    }

    const date = new Date(pubDate);
    if (isNaN(date.getTime())) return null;

    return {
      guid,
      title,
      link,
      description: this.extractText(item.description) || null,
      fullText: this.extractText(item['rbc_news:full-text']) || null,
      category: this.extractText(item.category) || null,
      pubDate: date,
    };
  }

  async getAllMatchedNews(companyId?: string) {
    return await this.prisma.articleMatch.findMany({
      ...(companyId ? { where: { companyId } } : {}),
      orderBy: { rawArticle: { pubDate: 'desc' } },
      include: {
        rawArticle: true,
        agentRun: { select: { steps: true, durationMs: true, model: true } },
      },
    });
  }

  /**
   * Достаёт текст из узла, который может быть:
   * - строкой
   * - объектом с __cdata (CDATA-секция)
   * - объектом с #text
   * - массивом (несколько тегов <rbc_news:tag>)
   */
  private extractText(node: any): string | undefined {
    if (node == null) return undefined;
    if (typeof node === 'string') return node;
    if (typeof node === 'number') return String(node);
    if (Array.isArray(node)) return this.extractText(node[0]);
    if (node.__cdata) return String(node.__cdata).trim();
    if (node['#text']) return String(node['#text']).trim();
    return undefined;
  }
}
