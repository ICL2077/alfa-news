import {
  ApiTags,
  ApiOperation,
  ApiParam,
  ApiCreatedResponse,
  ApiOkResponse,
  ApiBadRequestResponse,
  ApiConflictResponse,
  ApiNotFoundResponse,
} from '@nestjs/swagger';
import { ref } from '../openapi/schemas';
import {
  Body,
  Controller,
  Get,
  Param,
  Post,
  Sse,
  MessageEvent,
} from '@nestjs/common';
import { MessageDto } from './dto/message.dto';
import { ChatService } from './chat.service';
import { ChatEventsService } from './chat-events.service';
import { interval, map, merge } from 'rxjs';

@ApiTags('Chat')
@ApiNotFoundResponse({
  description: 'Чат или совпадение не найдено',
  schema: ref('ApiError'),
})
@Controller('chat')
export class ChatController {
  constructor(
    private chatService: ChatService,
    private events: ChatEventsService,
  ) {}

  @ApiOperation({ summary: 'Открыть или восстановить чат по совпадению' })
  @ApiParam({
    name: 'articleid',
    description: 'ArticleMatch.id из персональной ленты (не RawArticle.id)',
    type: String,
  })
  @ApiCreatedResponse({ schema: ref('Chat') })
  @Post('open/:articleid')
  async openArticleChat(@Param('articleid') id: string) {
    return this.chatService.openChat(id);
  }

  @ApiOperation({
    summary: 'Сохранить вопрос и запросить ответ',
    description:
      'Возвращает USER/PENDING. Ответ приходит отдельно через SSE и сохраняется в истории. Одновременно разрешён один незавершённый вопрос на чат.',
  })
  @ApiCreatedResponse({ schema: ref('Message') })
  @ApiBadRequestResponse({ schema: ref('ApiError') })
  @ApiConflictResponse({
    description: 'Предыдущий вопрос ещё PENDING',
    schema: ref('ApiError'),
  })
  @Post(':id/message')
  async postMessageToChat(@Body() dto: MessageDto, @Param('id') id: string) {
    return this.chatService.createMessage(dto, id);
  }

  @ApiOperation({
    summary: 'Восстановить историю сообщений',
    description:
      'Порядок createdAt ASC. Вызывать при открытии и переподключении SSE; сохранённая история — источник истины.',
  })
  @ApiOkResponse({ schema: { type: 'array', items: ref('HistoryMessage') } })
  @Get(':id/messages')
  async getChatMessages(@Param('id') id: string) {
    return this.chatService.getMessagesFromChat(id);
  }

  @ApiOperation({
    summary: 'Подписаться на события чата (SSE)',
    description:
      'Долгоживущее соединение EventSource или curl -N. События message (сохранённый AI-ответ с trace), failed (USER/FAILED), ping (каждые 25 с). Не воспроизводит пропущенные события и не поддерживает Last-Event-ID: после reconnect получите GET messages. Swagger Try it out не предназначен для чтения бесконечного потока.',
  })
  @ApiOkResponse({
    content: {
      'text/event-stream': {
        schema: { type: 'string' },
        example: 'event: ping\ndata: \n\n',
      },
    },
  })
  @Sse(':id/events')
  async stream(@Param('id') id: string) {
    await this.chatService.ensureChatExists(id);
    const ping = interval(25_000).pipe(
      map(() => ({ type: 'ping', data: '' }) as MessageEvent),
    );

    return merge(this.events.stream(id), ping);
  }
}
