import { Module } from '@nestjs/common';
import { ChatService } from './chat.service';
import { ChatController } from './chat.controller';
import { PrismaModule } from 'src/prisma/prisma.module';
import { OutboxModule } from 'src/outbox/outbox.module';
import { NatsJetStreamModule } from '@app/nats-jet-stream';
import { ChatEventsService } from './chat-events.service';
import { ChatMessagesConsumer } from './chat-messages.consumer';

@Module({
  imports: [PrismaModule, OutboxModule, NatsJetStreamModule],
  providers: [ChatService, ChatEventsService, ChatMessagesConsumer],
  controllers: [ChatController],
})
export class ChatModule {}
