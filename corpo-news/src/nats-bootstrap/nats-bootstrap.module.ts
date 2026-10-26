import { Module } from '@nestjs/common';
import { NatsBootstrapService } from './nats-bootstrap.service';
import { NatsJetStreamModule } from '@app/nats-jet-stream';

@Module({
  imports: [NatsJetStreamModule],
  providers: [NatsBootstrapService],
})
export class NatsBootstrapModule {}
