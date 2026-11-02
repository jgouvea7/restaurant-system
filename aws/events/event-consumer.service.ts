import {
  Injectable,
  Logger,
  OnModuleDestroy,
  OnModuleInit,
} from '@nestjs/common';
import {
  DeleteMessageCommand,
  ReceiveMessageCommand,
  SQSClient,
} from '@aws-sdk/client-sqs';
import { DomainEvent } from './event.types';

export interface EventConsumerOptions {
  maxMessages?: number;
  waitTimeSeconds?: number;
  visibilityTimeout?: number;
}

export type EventHandler = (event: DomainEvent) => Promise<void>;

@Injectable()
export class EventConsumerService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(EventConsumerService.name);
  private client!: SQSClient;
  private queueUrl?: string;

  onModuleInit(): void {
    this.queueUrl = process.env.SQS_QUEUE_URL;
    this.client = new SQSClient(this.buildConfig());
  }

  onModuleDestroy(): void {
    this.client?.destroy();
  }

  async receive(
    handler: EventHandler,
    options: EventConsumerOptions = {},
  ): Promise<number> {
    if (!this.queueUrl) {
      this.logger.warn('SQS_QUEUE_URL nao configurado; nenhum evento lido');
      return 0;
    }

    const response = await this.client.send(
      new ReceiveMessageCommand({
        QueueUrl: this.queueUrl,
        MaxNumberOfMessages: options.maxMessages ?? 10,
        WaitTimeSeconds: options.waitTimeSeconds ?? 20,
        VisibilityTimeout: options.visibilityTimeout ?? 30,
      }),
    );

    let processed = 0;

    for (const message of response.Messages ?? []) {
      try {
        const event = this.parseEvent(message.Body);

        await handler(event);

        if (message.ReceiptHandle) {
          await this.client.send(
            new DeleteMessageCommand({
              QueueUrl: this.queueUrl,
              ReceiptHandle: message.ReceiptHandle,
            }),
          );
        }

        processed += 1;
      } catch (error) {
        const messageText =
          error instanceof Error ? error.message : String(error);
        this.logger.error(`Falha ao processar evento: ${messageText}`);
      }
    }

    return processed;
  }

  private parseEvent(body: string | undefined): DomainEvent {
    if (!body) {
      throw new Error('Mensagem SQS vazia');
    }

    const parsed = JSON.parse(body) as Partial<DomainEvent>;

    if (!parsed.id || !parsed.type || !parsed.data) {
      throw new Error('Evento sem id, type ou data');
    }

    return parsed as DomainEvent;
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
