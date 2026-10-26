import { AgentTrace } from './agent.contract';

export const chatStream = {
  name: 'CHAT',
  subjects: { core: ['chat.>'] },
  consumers: {
    mlRequest: 'chat_request', // Python читает вопросы
    nestResponse: 'chat_response', // Nest читает ответы
  },
  filters: {
    request: 'chat.request.>',
    response: 'chat.response.>',
  },
};

export const subjectForChatRequest = (chatId: string, messageId: string) =>
  `chat.request.${chatId}.${messageId}`;
export const subjectForChatResponse = (chatId: string, replyToId: string) =>
  `chat.response.${chatId}.${replyToId}`;

/** Nest -> Python. Python без состояния: весь контекст приходит в событии. */
export interface ChatRequestEvent {
  chatId: string;
  messageId: string; // id вопроса пользователя; в ответе вернётся как replyToId
  question: string;
  history: { role: 'USER' | 'AI'; content: string }[]; // по порядку, старые первыми
  context: {
    company: { name: string; description: string | null; profileJson: unknown };
    article: {
      title: string;
      link: string;
      description: string | null;
      fullText: string | null; // обрезан до 6000 символов
      pubDate: string;
    };
    match: {
      score: number;
      category: string | null;
      impact: string | null;
      horizon: string | null;
      summary: string | null;
      explanation: string | null;
      actions?: string[];
      alfaView?: string | null;
      sources?: unknown;
    };
  };
  requestedAt: string; // ISO, UTC
}

/** Python -> Nest. Заполнено либо answer, либо error. */
export interface ChatResponseEvent {
  chatId: string;
  replyToId: string; // id вопроса, на который это ответ
  answer?: string;
  error?: string;
  trace?: AgentTrace | null;
  model?: string;
  respondedAt: string; // ISO, UTC
}
