import {
  Inject,
  Injectable,
  Logger,
  OnModuleDestroy,
  OnModuleInit,
  Optional,
} from '@nestjs/common';
import {
  EVENT_MAINTENANCE_STORE,
  EventMaintenanceStore,
} from './event.types';

@Injectable()
export class OutboxCleanupService
  implements OnModuleInit, OnModuleDestroy
{
  private readonly logger = new Logger(OutboxCleanupService.name);
  private timer?: ReturnType<typeof setTimeout>;
  private stopped = false;

  constructor(
    @Optional()
    @Inject(EVENT_MAINTENANCE_STORE)
    private readonly store?: EventMaintenanceStore,
  ) {}

  onModuleInit(): void {
    if (!this.store || process.env.OUTBOX_CLEANUP_ENABLED === 'false') {
      return;
    }

    const intervalMs = Number(
      process.env.OUTBOX_CLEANUP_INTERVAL_MS ?? 3_600_000,
    );

    this.schedule(
      Number.isFinite(intervalMs) && intervalMs > 0 ? intervalMs : 3_600_000,
    );

    const runOnStart = process.env.OUTBOX_CLEANUP_ON_START === 'true';

    if (runOnStart) {
      void this.run();
    }
  }

  onModuleDestroy(): void {
    this.stopped = true;

    if (this.timer) {
      clearTimeout(this.timer);
      this.timer = undefined;
    }
  }

  async run(now = new Date()): Promise<{
    published: number;
    processed: number;
  }> {
    if (!this.store) {
      return { published: 0, processed: 0 };
    }

    const outboxRetentionDays = this.readDays(
      'OUTBOX_RETENTION_DAYS',
      7,
    );
    const processedRetentionDays = this.readDays(
      'PROCESSED_EVENTS_RETENTION_DAYS',
      7,
    );
    const publishedBefore = new Date(
      now.getTime() - outboxRetentionDays * 24 * 60 * 60 * 1000,
    );
    const processedBefore = new Date(
      now.getTime() - processedRetentionDays * 24 * 60 * 60 * 1000,
    );

    const [published, processed] = await Promise.all([
      this.store.purgePublishedBefore(publishedBefore),
      this.store.purgeProcessedBefore(processedBefore),
    ]);

    if (published > 0 || processed > 0) {
      this.logger.log(
        JSON.stringify({
          message: 'outbox cleanup',
          publishedPurged: published,
          processedPurged: processed,
          publishedBefore: publishedBefore.toISOString(),
          processedBefore: processedBefore.toISOString(),
        }),
      );
    }

    return { published, processed };
  }

  private schedule(delayMs: number): void {
    if (this.stopped) {
      return;
    }

    this.timer = setTimeout(async () => {
      try {
        await this.run();
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        this.logger.error(`Falha na limpeza do outbox: ${message}`);
      }

      this.schedule(delayMs);
    }, delayMs);

    this.timer.unref?.();
  }

  private readDays(envName: string, fallback: number): number {
    const value = Number(process.env[envName] ?? fallback);

    return Number.isFinite(value) && value >= 0 ? value : fallback;
  }
}
