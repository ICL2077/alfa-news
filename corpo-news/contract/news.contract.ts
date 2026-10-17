// ============================================================
// NATS: stream, subjects, consumer names
// ============================================================

export const newsStream = {
    name: 'NEWS',
    subjects: {
        coreSubject: ['news.>'],
        /** Python читает сырые новости */
        mlConsumerSubject: 'news.raw.>',
        /** NestJS читает результаты обработки */
        nestConsumerSubject: 'news.processed.>',
    },
    consumers: {
        nestNewsConsumer: 'news_processed',
        mlNewsConsumer: 'news_raw',
    },
};

export const subjectForRawNews = (articleId: string) => `news.raw.${articleId}`;
export const subjectForProcessedNews = (articleId: string) => `news.processed.${articleId}`;

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
    guid: string;
    companyId: string;
    isRelevant: boolean;
    score: number;
    summary: string;
    explanation: string;
    model?: string;
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
