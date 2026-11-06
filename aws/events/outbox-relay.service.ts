import {
  Inject,
  Injectable,
  Logger,
  OnModuleDestroy,
  OnModuleInit,
  Optional,
} from '@nestjs/common';
import { EVENT_OUTBOX_STORE, EventOutboxStore } from './event.types';
import { EventPublisherService } from './event-publisher.service';

@Injectable()
export class OutboxRelayService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(OutboxRelayService.name);
  private timer?: ReturnType<typeof setTimeout>;
  private running = false;
  private stopped = false;

  constructor(
    private readonly publisher: EventPublisherService,
    @Optional()
    @Inject(EVENT_OUTBOX_STORE)
    private readonly outbox?: EventOutboxStore,
  ) {}

  onModuleInit(): void {
    if (!this.outbox || process.env.OUTBOX_RELAY_ENABLED === 'false') {
      return;
    }

    this.schedule(Number(process.env.OUTBOX_RELAY_INTERVAL_MS ?? 1000));
  }

  onModuleDestroy(): void {
    this.stopped = true;

    if (this.timer) {
      clearTimeout(this.timer);
      this.timer = undefined;
    }
  }

  async flush(): Promise<number> {
    if (!this.outbox || this.running) {
      return 0;
    }

    this.running = true;
    let published = 0;

    try {
      const events = await this.outbox.claimPending(
        Number(process.env.OUTBOX_BATCH_SIZE ?? 20),
      );

      for (const event of events) {
        try {
          await this.publisher.deliver(event);
          await this.outbox.markPublished(event.id);
          published += 1;
        } catch (error) {
          const message =
            error instanceof Error ? error.message : String(error);
          await this.outbox.markFailed(event.id, event.attempts, message);
          this.logger.warn(
            `Falha ao publicar evento ${event.type} (${event.id}): ${message}`,
          );
        }
      }
    } finally {
      this.running = false;
    }

    return published;
  }

  private schedule(delayMs: number): void {
    if (this.stopped) {
      return;
    }

    this.timer = setTimeout(async () => {
      try {
        await this.flush();
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        this.logger.error(`Falha no relay do outbox: ${message}`);
      }

      this.schedule(delayMs);
    }, delayMs);

    this.timer.unref?.();
  }
}
