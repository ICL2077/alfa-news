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
    mlBacklogConsumer: 'news.backlog.>',
  },
  consumers: {
    nestNewsConsumer: 'news_processed',
    mlNewsConsumer: 'news_raw',
    mlBacklogConsumer: 'news_backlog',
  },
};

export const subjectForRawNews = (articleId: string) => `news.raw.${articleId}`;
export const subjectForProcessedNews = (companyId: string, articleId: string) =>
  `news.processed.${companyId}.${articleId}`;
export const subjectForBacklogNews = (companyId: string, articleId: string) =>
  `news.backlog.${companyId}.${articleId}`;

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

/** Новость из архива, которую нужно оценить только для одной (новой) компании */
export interface NewsBacklogEvent extends NewsRawEvent {
  companyId: string;
}

export interface AnalysisSource {
  type: 'news' | 'alfa';
  ref: string;
  url?: string;
  page?: number;
  quote?: string;
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
  actions?: string[];
  alfaView?: string;
  sources?: AnalysisSource[];

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
