import { Module } from '@nestjs/common';
import { NatsJetStreamService } from './nats-jet-stream.service';

@Module({
  providers: [NatsJetStreamService],
  exports: [NatsJetStreamService],
})
export class NatsJetStreamModule {}
