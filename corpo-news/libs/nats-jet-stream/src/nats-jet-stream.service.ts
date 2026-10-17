import {
  Injectable,
  Logger,
  OnModuleDestroy,
  OnModuleInit,
} from '@nestjs/common';
import { NatsConnection, connect, nanos } from '@nats-io/transport-node';
import {
  AckPolicy,
  DeliverPolicy,
  DiscardPolicy,
  jetstream,
  JetStreamClient,
  jetstreamManager,
  JetStreamManager,
  ReplayPolicy,
  RetentionPolicy,
  StorageType,
} from '@nats-io/jetstream';

@Injectable()
export class NatsJetStreamService implements OnModuleInit, OnModuleDestroy {
  private logger = new Logger(NatsJetStreamService.name);
  private natsConnection: NatsConnection;
  JSClient: JetStreamClient;
  JSManager: JetStreamManager;

  async onModuleInit() {
    try {
      this.natsConnection = await connect({
        servers: process.env.NATS_URL ?? 'nats://localhost:4222',
      });
      this.JSClient = jetstream(this.natsConnection);
      this.JSManager = await jetstreamManager(this.natsConnection);
      this.logger.log('Connected to NATS JetStream');
    } catch (error) {
      this.logger.error(`NATS connection failed: ${(error as Error).message}`);
      throw error;
    }
  }

  async onModuleDestroy() {
    await this.natsConnection.drain();
  }

  async ensureMessagesStream(streamName: string, subjects: string[]) {
    await this.JSManager.streams.add({
      name: streamName,
      subjects: subjects,
      duplicate_window: nanos(2 * 60 * 1000), // 2 минуты,
      max_bytes: 1024 * 1024 * 1024, // 1 гб
      retention: RetentionPolicy.Limits,
      storage: StorageType.File,
      discard: DiscardPolicy.Old,
    });
  }

  async ensureMessagesConsumer(
    streamName: string,
    consumerName: string,
    subjectToConsume: string,
  ) {
    await this.JSManager.consumers.add(streamName, {
      durable_name: consumerName,
      filter_subject: subjectToConsume,
      ack_policy: AckPolicy.Explicit,
      deliver_policy: DeliverPolicy.All,
      replay_policy: ReplayPolicy.Instant,
      max_deliver: 5,
      backoff: [nanos(10_000), nanos(20_000), nanos(30_000)],
    });
  }

  async publishMessage(subject: string, data: unknown, msgId?: string) {
    const pubAck = await this.JSClient.publish(subject, JSON.stringify(data), {
      msgID: msgId,
      timeout: 5_000,
    });

    if (pubAck.duplicate)
      this.logger.debug(`Message ${subject} dublicate - skip`);

    return pubAck;
  }
}
