import {
  Inject,
  Injectable,
  Logger,
  OnModuleDestroy,
  Optional,
} from '@nestjs/common';
import {
  DeleteMessageCommand,
  ReceiveMessageCommand,
  SQSClient,
} from '@aws-sdk/client-sqs';
import {
  DomainEvent,
  EVENT_IDEMPOTENCY_STORE,
  EventIdempotencyStore,
  IdempotencyClaim,
} from './event.types';

export interface EventConsumerOptions {
  maxMessages?: number;
  waitTimeSeconds?: number;
  visibilityTimeout?: number;
  pollIntervalMs?: number;
}

export type EventHandler = (event: DomainEvent) => Promise<void>;

@Injectable()
export class EventConsumerService implements OnModuleDestroy {
  private readonly logger = new Logger(EventConsumerService.name);
  private readonly client: SQSClient;
  private readonly queueUrl?: string;
  private running = false;
  private timer?: ReturnType<typeof setTimeout>;

  constructor(
    @Optional()
    @Inject(EVENT_IDEMPOTENCY_STORE)
    private readonly idempotency?: EventIdempotencyStore,
  ) {
    this.queueUrl = process.env.SQS_QUEUE_URL;
    this.client = new SQSClient(this.buildConfig());
  }

  onModuleDestroy(): void {
    this.stop();
    this.client?.destroy();
  }

  start(handler: EventHandler, options: EventConsumerOptions = {}): boolean {
    if (this.running) {
      return false;
    }

    if (!this.queueUrl) {
      this.logger.warn(
        'SQS_QUEUE_URL nao configurado; consumer nao iniciado',
      );
      return false;
    }

    this.running = true;

    const loop = async () => {
      if (!this.running) {
        return;
      }

      try {
        await this.receive(handler, options);
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        this.logger.error(`Falha ao ler a fila SQS: ${message}`);
      }

      if (this.running) {
        this.timer = setTimeout(loop, options.pollIntervalMs ?? 1000);
        this.timer.unref?.();
      }
    };

    void loop();

    return true;
  }

  stop(): void {
    this.running = false;

    if (this.timer) {
      clearTimeout(this.timer);
      this.timer = undefined;
    }
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
        const claim = await this.claim(event.id);

        if (claim === 'locked') {
          continue;
        }

        if (claim === 'processed') {
          await this.delete(message.ReceiptHandle);
          continue;
        }

        try {
          await handler(event);
          await this.idempotency?.markProcessed(this.consumerName, event.id);
        } catch (error) {
          await this.idempotency?.release(this.consumerName, event.id);
          throw error;
        }

        await this.delete(message.ReceiptHandle);
        processed += 1;
      } catch (error) {
        const messageText =
          error instanceof Error ? error.message : String(error);
        this.logger.error(`Falha ao processar evento: ${messageText}`);
      }
    }

    return processed;
  }

  private get consumerName(): string {
    return process.env.EVENT_CONSUMER_NAME ?? process.env.SERVICE_NAME ?? 'unknown';
  }

  private async claim(eventId: string): Promise<IdempotencyClaim> {
    if (!this.idempotency) {
      return 'acquired';
    }

    return this.idempotency.claim(this.consumerName, eventId);
  }

  private async delete(receiptHandle: string | undefined): Promise<void> {
    if (!receiptHandle) {
      return;
    }

    await this.client.send(
      new DeleteMessageCommand({
        QueueUrl: this.queueUrl,
        ReceiptHandle: receiptHandle,
      }),
    );
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
