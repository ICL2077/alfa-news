import type { SchemaObject } from '@nestjs/swagger';

export const ref = (name: string) => ({ $ref: `#/components/schemas/${name}` });
const text = (nullable = false): SchemaObject => ({
  type: 'string',
  ...(nullable ? { nullable } : {}),
});
const uuid: SchemaObject = { type: 'string', format: 'uuid' };
const date: SchemaObject = { type: 'string', format: 'date-time' };
const strings: SchemaObject = { type: 'array', items: text() };
const json: SchemaObject = { type: 'object', additionalProperties: true };
const object = (
  properties: SchemaObject['properties'],
  required = Object.keys(properties ?? {}),
): SchemaObject => ({ type: 'object', properties, required });

export const responseSchemas: Record<string, SchemaObject> = {
  ApiError: object(
    {
      statusCode: { type: 'integer' },
      message: { oneOf: [text(), strings] },
      error: text(),
    },
    ['statusCode', 'message'],
  ),
  Company: object({
    id: uuid,
    inn: text(true),
    name: text(),
    description: text(true),
    okved: text(true),
    region: text(true),
    keywords: strings,
    profileJson: { ...json, nullable: true },
    bankClientId: text(true),
    status: { type: 'string', enum: ['DRAFT', 'READY'] },
    createdAt: date,
    updatedAt: date,
  }),
  Step: object({
    seq: { type: 'integer' },
    type: text(),
    title: text(),
    status: { type: 'string', enum: ['ok', 'skipped', 'error'] },
    durationMs: { type: 'integer', minimum: 0 },
    detail: json,
  }),
  Trace: object(
    {
      steps: { type: 'array', items: ref('Step') },
      durationMs: { type: 'integer', minimum: 0 },
      model: text(true),
    },
    ['steps', 'durationMs'],
  ),
  Message: object({
    id: uuid,
    chatId: uuid,
    content: text(),
    role: { type: 'string', enum: ['USER', 'AI'] },
    status: { type: 'string', enum: ['PENDING', 'DONE', 'FAILED'] },
    replyToId: text(true),
    createdAt: date,
  }),
  HistoryMessage: {
    allOf: [
      ref('Message'),
      object({ trace: { allOf: [ref('Trace')], nullable: true } }),
    ],
  },
  Chat: object({
    id: uuid,
    articleId: uuid,
    createdAt: date,
    messages: { type: 'array', items: ref('Message') },
  }),
  Source: object(
    {
      type: { type: 'string', enum: ['news', 'bank', 'alfa'] },
      ref: text(),
      url: text(),
      page: { type: 'integer' },
      quote: text(),
    },
    ['type', 'ref'],
  ),
  RawArticle: object({
    id: uuid,
    guid: text(),
    title: text(),
    link: { type: 'string', format: 'uri' },
    description: text(true),
    fullText: text(true),
    category: text(true),
    pubDate: date,
    processed: { type: 'boolean' },
    sendToStream: { type: 'boolean' },
    createdAt: date,
  }),
  ArticleMatch: object({
    id: uuid,
    rawArticleId: uuid,
    companyId: uuid,
    category: text(true),
    score: { type: 'number', minimum: 0, maximum: 1 },
    summary: text(true),
    explanation: text(true),
    createdAt: date,
    impact: text(true),
    horizon: text(true),
    actions: strings,
    alfaView: text(true),
    sources: { type: 'array', items: ref('Source'), nullable: true },
    agentRun: { allOf: [ref('Trace')], nullable: true },
    rawArticle: ref('RawArticle'),
  }),
};
