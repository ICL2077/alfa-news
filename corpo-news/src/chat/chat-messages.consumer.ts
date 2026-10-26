import { NatsJetStreamService } from '@app/nats-jet-stream';
import { ConsumerMessages, JsMsg } from '@nats-io/jetstream';
import {
  Injectable,
  Logger,
  OnApplicationBootstrap,
  OnModuleDestroy,
} from '@nestjs/common';
import { isAgentTrace } from 'contract/agent.contract';
import { ChatService } from './chat.service';
import { ChatResponseEvent, chatStream } from 'contract/chat.contract';

@Injectable()
export class ChatMessagesConsumer
  implements OnApplicationBootstrap, OnModuleDestroy
{
  private messages: ConsumerMessages;
  private logger = new Logger(ChatMessagesConsumer.name);

  constructor(
    private JSService: NatsJetStreamService,
    private chat: ChatService,
  ) {}

  async onApplicationBootstrap() {
    const consumer = await this.JSService.JSClient.consumers.get(
      chatStream.name,
      chatStream.consumers.nestResponse,
    );

    this.messages = await consumer.consume({ max_messages: 20 });

    void this.run();
  }

  onModuleDestroy() {
    this.messages?.stop();
  }

  private async run() {
    try {
      for await (const msg of this.messages) {
        await this.handle(msg);
      }
    } catch (err) {
      this.logger.error(
        `Chat response consumption loop crashed - ${err.message}`,
      );
    }
  }

  private async handle(msg: JsMsg) {
    let event: ChatResponseEvent;
    try {
      event = msg.json();
    } catch {
      this.logger.log(`Bad JSON on ${msg.subject}`);
      return msg.term();
    }

    if (!event?.chatId || !event?.replyToId ||
      (event.answer != null && (typeof event.answer !== 'string' || event.answer.length > 20000)) ||
      (event.error != null && typeof event.error !== 'string') ||
      (event.trace != null && !isAgentTrace(event.trace))) {
      this.logger.warn(`invalid chat response message`);
      return msg.term();
    }

    try {
      await this.chat.handleResponse(event);
      return msg.ack();
    } catch (err) {
      this.logger.error(`error in handling event - ${err.message}`);
      return msg.nak();
    }
  }
}
