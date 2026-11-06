import { randomUUID } from 'node:crypto';
import {
  Inject,
  Injectable,
  Logger,
  OnModuleDestroy,
  Optional,
} from '@nestjs/common';
import { PublishCommand, SNSClient } from '@aws-sdk/client-sns';
import {
  DomainEvent,
  EVENT_OUTBOX_STORE,
  EventOutboxStore,
  EventPayloads,
  EventType,
} from './event.types';

@Injectable()
export class EventPublisherService implements OnModuleDestroy {
  private readonly logger = new Logger(EventPublisherService.name);
  private readonly client: SNSClient;
  private readonly topicArn?: string;

  constructor(
    @Optional()
    @Inject(EVENT_OUTBOX_STORE)
    private readonly outbox?: EventOutboxStore,
  ) {
    this.topicArn = process.env.SNS_TOPIC_ARN;
    this.client = new SNSClient(this.buildConfig());
  }

  onModuleDestroy(): void {
    this.client?.destroy();
  }

  async publish<T extends EventType>(
    type: T,
    data: EventPayloads[T],
    source = process.env.SERVICE_NAME ?? 'unknown',
    manager?: unknown,
  ): Promise<string | null> {
    const event: DomainEvent<T> = {
      id: randomUUID(),
      type,
      source,
      occurredAt: new Date().toISOString(),
      data,
    };

    if (this.outbox) {
      await this.outbox.save(event, manager);
      return event.id;
    }

    try {
      await this.deliver(event);
      return event.id;
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      this.logger.error(`Falha ao publicar evento ${type}: ${message}`);
      return null;
    }
  }

  async deliver(event: DomainEvent): Promise<void> {
    if (!this.topicArn) {
      throw new Error('SNS_TOPIC_ARN nao configurado');
    }

    await this.client.send(
      new PublishCommand({
        TopicArn: this.topicArn,
        Message: JSON.stringify(event),
        MessageAttributes: {
          eventType: {
            DataType: 'String',
            StringValue: event.type,
          },
          source: {
            DataType: 'String',
            StringValue: event.source,
          },
        },
      }),
    );
  }

  private buildConfig() {
    const region =
      process.env.AWS_DEFAULT_REGION ?? process.env.AWS_REGION ?? 'us-east-1';

    return {
      region,
      endpoint: process.env.AWS_ENDPOINT_URL ?? 'http://localhost:4566',
      credentials: {
        accessKeyId: process.env.AWS_ACCESS_KEY_ID ?? 'test',
        secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY ?? 'test',
      },
    };
  }
}
