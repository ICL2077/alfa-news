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

@Controller('chat')
export class ChatController {
  constructor(
    private chatService: ChatService,
    private events: ChatEventsService,
  ) {}

  @Post('open/:articleid')
  async openArticleChat(@Param('articleid') id: string) {
    return this.chatService.openChat(id);
  }

  @Post(':id/message')
  async postMessageToChat(@Body() dto: MessageDto, @Param('id') id: string) {
    return this.chatService.createMessage(dto, id);
  }

  @Get(':id/messages')
  async getChatMessages(@Param('id') id: string) {
    return this.chatService.getMessagesFromChat(id);
  }

  @Sse(':id/events')
  async stream(@Param('id') id: string) {
    await this.chatService.ensureChatExists(id);
    const ping = interval(25_000).pipe(
      map(() => ({ type: 'ping', data: '' }) as MessageEvent),
    );

    return merge(this.events.stream(id), ping);
  }
}
