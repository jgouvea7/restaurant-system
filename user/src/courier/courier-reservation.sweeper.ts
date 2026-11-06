import {
  Injectable,
  Logger,
  OnModuleDestroy,
  OnModuleInit,
  Optional,
} from '@nestjs/common';
import { CourierService } from './courier.service';

@Injectable()
export class CourierReservationSweeper
  implements OnModuleInit, OnModuleDestroy
{
  private readonly logger = new Logger(CourierReservationSweeper.name);
  private timer?: ReturnType<typeof setTimeout>;
  private stopped = false;

  constructor(@Optional() private readonly courierService?: CourierService) {}

  onModuleInit(): void {
    if (
      !this.courierService ||
      process.env.COURIER_RESERVATION_SWEEP_ENABLED === 'false'
    ) {
      return;
    }

    const intervalMs = Number(
      process.env.COURIER_RESERVATION_SWEEP_INTERVAL_MS ?? 30_000,
    );

    this.schedule(
      Number.isFinite(intervalMs) && intervalMs > 0 ? intervalMs : 30_000,
    );
  }

  onModuleDestroy(): void {
    this.stopped = true;

    if (this.timer) {
      clearTimeout(this.timer);
      this.timer = undefined;
    }
  }

  async run(now = new Date()): Promise<number> {
    if (!this.courierService) {
      return 0;
    }

    const released = await this.courierService.releaseExpiredReservations(now);

    if (released > 0) {
      this.logger.log(
        JSON.stringify({ message: 'reservas expiradas liberadas', released }),
      );
    }

    return released;
  }

  private schedule(delayMs: number): void {
    if (this.stopped) {
      return;
    }

    this.timer = setTimeout(() => {
      void this.tick(delayMs);
    }, delayMs);

    this.timer.unref?.();
  }

  private async tick(delayMs: number): Promise<void> {
    try {
      await this.run();
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      this.logger.error(`Falha ao liberar reservas expiradas: ${message}`);
    }

    this.schedule(delayMs);
  }
}
