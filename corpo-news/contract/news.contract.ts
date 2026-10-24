// ============================================================
// NATS: stream, subjects, consumer names
// ============================================================

import { AgentTrace } from './agent.contract';

export const newsStream = {
  name: 'NEWS',
  subjects: {
    core: ['news.>'],
  },
  filters: {
    mlConsumer: 'news.raw.>',
    nestConsumer: 'news.processed.>',
  },
  consumers: {
    nestNewsConsumer: 'news_processed',
    mlNewsConsumer: 'news_raw',
  },
};

export const subjectForRawNews = (articleId: string) => `news.raw.${articleId}`;
export const subjectForProcessedNews = (companyId: string, articleId: string) =>
  `news.processed.${companyId}.${articleId}`;

// ============================================================
// Events
// ============================================================

export interface NewsRawEvent {
  id: string;
  /** Уникальный идентификатор новости из RSS */
  guid: string;
  title: string;
  description: string | null;
  fullText: string | null;
  link: string;
  category: string | null;
  /** ISO, UTC */
  pubDate: string;
  /** ISO, UTC */
  publishedAt: string;
}

export interface NewsProcessedEvent {
  articleId: string;
  companyId: string;
  score: number;
  summary: string;
  explanation: string;
  category?: string;
  model?: string;
  impact?: string | null;
  horizon?: string | null;

  trace?: AgentTrace | null;

  /** ISO, UTC */
  processedAt: string;
}

export interface NewsFailedEvent {
  articleId: string;
  guid: string;
  companyId: string | null;
  reason: string;
  attempt: number;
  /** ISO, UTC */
  failedAt: string;
}
