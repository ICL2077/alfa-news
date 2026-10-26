import {
  BadRequestException,
  ConflictException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { OutboxService } from 'src/outbox/outbox.service';
import { PrismaService } from 'src/prisma/prisma.service';
import { MessageDto } from './dto/message.dto';
import { ChatRequestEvent, ChatResponseEvent } from 'contract/chat.contract';
import { Cron, CronExpression } from '@nestjs/schedule';
import { ChatEventsService } from './chat-events.service';
import { Prisma } from 'generated/prisma';
import { AgentStep } from 'contract/agent.contract';

@Injectable()
export class ChatService {
  private logger = new Logger(ChatService.name);
  constructor(
    private prisma: PrismaService,
    private outbox: OutboxService,
    private events: ChatEventsService,
  ) {}

  async openChat(articleId: string) {
    const article = await this.prisma.articleMatch.findUnique({
      where: { id: articleId },
      select: { id: true },
    });
    if (!article) throw new NotFoundException('Article is not found');

    return await this.prisma.chat.upsert({
      where: { articleId },
      create: { articleId },
      update: {},
      include: { messages: { orderBy: { createdAt: 'asc' } } },
    });
  }

  async getMessagesFromChat(id: string) {
    await this.ensureChatExists(id);
    const messages = await this.prisma.message.findMany({
      where: { chatId: id },
      orderBy: { createdAt: 'asc' },
      include: {
        agentRun: {
          select: { steps: true, durationMs: true, model: true },
        },
      },
    });

    return messages.map(({ agentRun, ...m }) => ({
      ...m,
      trace: agentRun
        ? {
            steps: agentRun.steps as unknown as AgentStep[],
            durationMs: agentRun.durationMs ?? 0,
            model: agentRun.model,
          }
        : null,
    }));
  }

  async ensureChatExists(id: string) {
    if (!await this.prisma.chat.findUnique({ where: { id }, select: { id: true } }))
      throw new NotFoundException('Chat not found');
  }

  // сохраняем отправленное сообщение и отправляем его к llm за ответом
  async createMessage(dto: MessageDto, chatId: string) {
    if (!(dto.content ?? '').trim())
      throw new BadRequestException('Empty message');

    return await this.prisma.$transaction(async (trans) => {
      await trans.$queryRaw`SELECT id FROM "Chat" WHERE id = ${chatId} FOR UPDATE`;

      const pendigMessage = await trans.message.findFirst({
        where: { chatId, role: 'USER', status: 'PENDING' },
        select: { id: true }, // race condition проверка чтобы случайно не обработать одно и то же сообщение дважды
      });

      if (pendigMessage)
        throw new ConflictException(`Wait for answer to your last message`);

      const chat = await trans.chat.findUnique({
        where: { id: chatId },
        include: { article: { include: { rawArticle: true, company: true } } },
      });

      if (!chat) throw new NotFoundException('Chat not found');

      const chatMessagesHistory = await trans.message.findMany({
        where: { chatId: chat.id, status: 'DONE' },
        orderBy: { createdAt: 'desc' },
        take: 10, // лимит получения  неиронкой истории сообщений
      });

      const message = await trans.message.create({
        data: {
          chatId: chatId,
          content: dto.content,
          role: 'USER',
          status: 'PENDING',
        },
      });

      const chatArticle = chat.article;

      const event: ChatRequestEvent = {
        chatId,
        messageId: message.id,
        question: dto.content,
        history: chatMessagesHistory.reverse().map((x) => ({
          role: x.role as 'USER' | 'AI',
          content: x.content,
        })),
        context: {
          company: {
            name: chatArticle.company.name,
            description: chatArticle.company.description,
            profileJson: chatArticle.company.profileJson,
          },
          article: {
            title: chatArticle.rawArticle.title,
            link: chatArticle.rawArticle.link,
            description: chatArticle.rawArticle.description,
            fullText: chatArticle.rawArticle.fullText?.slice(0, 6000) ?? null,
            pubDate: chatArticle.rawArticle.pubDate.toISOString(),
          },
          match: {
            score: chatArticle.score,
            category: chatArticle.category,
            impact: chatArticle.impact,
            horizon: chatArticle.horizon,
            summary: chatArticle.summary,
            explanation: chatArticle.explanation,
            actions: chatArticle.actions,
            alfaView: chatArticle.alfaView,
            sources: chatArticle.sources,
          },
        },
        requestedAt: new Date().toISOString(),
      };

      await this.outbox.enqueue(trans, 'chat.request', event);
      return message;
    });
  }

  // принимаем ответ на сообщение от llm
  async handleResponse(e: ChatResponseEvent) {
    const res = await this.prisma.$transaction(async (trans) => {
      const userMessage = await trans.message.findUnique({
        where: { id: e.replyToId },
      });

      if (
        !userMessage ||
        userMessage.chatId !== e.chatId ||
        userMessage.role !== 'USER'
      )
        return null;

      const isFail = !!e.error || !e.answer?.trim();

      const messageResponded = await trans.message.updateMany({
        where: { id: userMessage.id, status: 'PENDING' },
        data: { status: isFail ? 'FAILED' : 'DONE' },
      });
      if (messageResponded.count === 0) return null;

      if (isFail) {
        this.logger.error(
          `Message reply reseive failed ${e.error ?? 'empty error message'}`,
        );
        return {
          type: 'failed',
          message: { ...userMessage, status: 'FAILED' },
        };
      }

      const answer = await trans.message.create({
        data: {
          chatId: e.chatId,
          content: e.answer!.trim(),
          role: 'AI',
          status: 'DONE',
          replyToId: userMessage.id,
        },
      });

      if (e.trace) {
        await trans.agentRun.create({
          data: {
            kind: 'CHAT_ANSWER',
            messageId: answer.id,
            model: e.model ?? null,
            durationMs: e.trace.durationMs,
            steps: e.trace.steps as unknown as Prisma.InputJsonValue,
          },
        });
      }

      return { type: 'message', message: answer, trace: e.trace ?? null };
    });

    if (res) {
      if (res.type === 'message') {
        this.events.emit(e.chatId, 'message', {
          ...res.message,
          trace: res.trace ?? null,
        });
      } else {
        this.events.emit(e.chatId, 'failed', res.message);
      }
    }
  }

  // те сообщения что не получили ответ в течении 3х минут мы будем помечать failed
  @Cron(CronExpression.EVERY_30_SECONDS)
  async failStale() {
    const staledMessages = await this.prisma.message.findMany({
      where: {
        role: 'USER',
        status: 'PENDING',
        createdAt: { lt: new Date(Date.now() - 3 * 60 * 1000) },
      },
    });

    // проходим циклом и меняем статус у просроченных сообщений на FAILED
    for (const msg of staledMessages) {
      const failedMessages = await this.prisma.message.updateMany({
        where: { id: msg.id, status: 'PENDING' },
        data: { status: 'FAILED' },
      });

      if (failedMessages.count === 0) continue;

      this.logger.warn(`Message ${msg.id} timed out`);
      this.events.emit(msg.chatId, 'failed', { ...msg, status: 'FAILED' });
    }
  }
}
