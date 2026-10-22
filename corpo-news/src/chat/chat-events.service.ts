import { Injectable, MessageEvent } from '@nestjs/common';
import { filter, map, Subject } from 'rxjs';

@Injectable()
export class ChatEventsService {
  private bus = new Subject<{ chatId: string; event: MessageEvent }>();

  emit(chatId: string, type: 'message' | 'failed', data: unknown) {
    this.bus.next({ chatId, event: { type, data } as MessageEvent });
  }

  stream(chatId: string) {
    return this.bus.pipe(
      filter((x) => x.chatId === chatId),
      map((x) => x.event),
    );
  }
}
