import { randomUUID } from 'node:crypto';
import { Injectable, Logger, OnModuleDestroy } from '@nestjs/common';
import { PublishCommand, SNSClient } from '@aws-sdk/client-sns';
import {
  DomainEvent,
  EventPayloads,
  EventType,
} from './event.types';

@Injectable()
export class EventPublisherService implements OnModuleDestroy {
  private readonly logger = new Logger(EventPublisherService.name);
  private readonly client: SNSClient;
  private readonly topicArn?: string;

  constructor() {
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
  ): Promise<string | null> {
    const event: DomainEvent<T> = {
      id: randomUUID(),
      type,
      source,
      occurredAt: new Date().toISOString(),
      data,
    };

    if (!this.topicArn) {
      this.logger.warn(
        `SNS_TOPIC_ARN nao configurado; evento ${type} descartado`,
      );
      return null;
    }

    try {
      await this.client.send(
        new PublishCommand({
          TopicArn: this.topicArn,
          Message: JSON.stringify(event),
          MessageAttributes: {
            eventType: {
              DataType: 'String',
              StringValue: type,
            },
            source: {
              DataType: 'String',
              StringValue: event.source,
            },
          },
        }),
      );

      return event.id;
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      this.logger.error(`Falha ao publicar evento ${type}: ${message}`);
      return null;
    }
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
