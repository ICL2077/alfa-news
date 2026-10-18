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

export type deliverPolicies = 'lastPerSubject' | 'All' | 'New' | 'Last';

export interface ConsumerSettings {
  deliverPolicy?: deliverPolicies;
  backoffInterval?: number[];
  ackWait?: number;
}

export interface StreamSettings {
  maxMsgsPerSubject?: number;
}

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

  async ensureMessagesStream(
    streamName: string,
    subjects: string[],
    options?: StreamSettings,
  ) {
    const params = {
      name: streamName,
      subjects: subjects,
      duplicate_window: nanos(2 * 60 * 1000), // 2 минуты,
      max_bytes: 1024 * 1024 * 1024, // 1 гб
      retention: RetentionPolicy.Limits,
      max_msgs_per_subject: options?.maxMsgsPerSubject ?? -1,
      storage: StorageType.File,
      discard: DiscardPolicy.Old,
    };

    let exists = true;

    try {
      await this.JSManager.streams.info(streamName);
    } catch {
      exists = false;
    }

    if (exists) {
      await this.JSManager.streams.update(streamName, params);
    } else {
      await this.JSManager.streams.add(params);
    }
  }

  async ensureMessagesConsumer(
    streamName: string,
    consumerName: string,
    subjectToConsume: string,
    options?: ConsumerSettings,
  ) {
    let typedDeliverPolicy: DeliverPolicy;

    switch (options?.deliverPolicy) {
      case 'lastPerSubject':
        typedDeliverPolicy = DeliverPolicy.LastPerSubject;
        break;
      case 'New':
        typedDeliverPolicy = DeliverPolicy.New;
        break;
      case 'Last':
        typedDeliverPolicy = DeliverPolicy.Last;
        break;
      default:
        typedDeliverPolicy = DeliverPolicy.All;
        break;
    }

    const params = {
      durable_name: consumerName,
      filter_subject: subjectToConsume,
      ack_policy: AckPolicy.Explicit,
      deliver_policy: typedDeliverPolicy,
      replay_policy: ReplayPolicy.Instant,
      max_deliver: 5,
      ...(options?.backoffInterval && !options.ackWait
        ? { backoff: options.backoffInterval?.map((i) => nanos(i)) }
        : { ack_wait: nanos(options?.ackWait ?? 30_000) }),
    };

    let exists = true;

    try {
      await this.JSManager.consumers.info(streamName, consumerName);
    } catch {
      exists = false;
    }

    try {
      if (exists) {
        await this.JSManager.consumers.update(streamName, consumerName, params);
      } else {
        await this.JSManager.consumers.add(streamName, params);
      }
    } catch (e) {
      throw new Error(
        `consumer ${consumerName} on stream ${streamName} failed to compile - ${e.message}`,
      );
    }
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
