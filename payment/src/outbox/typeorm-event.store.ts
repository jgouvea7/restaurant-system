import { Injectable, Logger } from '@nestjs/common';
import { DataSource, EntityManager } from 'typeorm';
import {
  DomainEvent,
  EventIdempotencyStore,
  EventMaintenanceStore,
  EventOutboxStore,
  IdempotencyClaim,
  StoredEvent,
} from '@restaurant/aws';
import {
  OutboxEvent,
  OutboxEventStatus,
} from './outbox-event.entity';
import {
  ProcessedEvent,
  ProcessedEventStatus,
} from './processed-event.entity';

const LOCK_MS = 60_000;
const MAX_BACKOFF_MS = 60_000;
const PROCESSING_TIMEOUT_MS = 120_000;

@Injectable()
export class TypeOrmEventStore
  implements EventOutboxStore, EventIdempotencyStore, EventMaintenanceStore
{
  private readonly logger = new Logger(TypeOrmEventStore.name);

  constructor(private readonly dataSource: DataSource) {}

  async save(event: DomainEvent, manager?: unknown): Promise<void> {
    const repository =
      (manager as EntityManager | undefined)?.getRepository(OutboxEvent) ??
      this.dataSource.getRepository(OutboxEvent);

    await repository.insert({
      id: event.id,
      type: event.type,
      source: event.source,
      data: event.data as unknown as object,
      occurredAt: new Date(event.occurredAt),
      status: OutboxEventStatus.PENDING,
      attempts: 0,
      nextAttemptAt: null,
      lastError: null,
      publishedAt: null,
    });
  }

  async claimPending(limit: number): Promise<StoredEvent[]> {
    const repository = this.dataSource.getRepository(OutboxEvent);
    const now = new Date();
    const staleBefore = new Date(now.getTime() - PROCESSING_TIMEOUT_MS);

    await repository
      .createQueryBuilder()
      .update(OutboxEvent)
      .set({ status: OutboxEventStatus.PENDING, nextAttemptAt: now })
      .where('status = :status AND updatedAt <= :staleBefore', {
        status: OutboxEventStatus.PROCESSING,
        staleBefore,
      })
      .execute();

    const candidates = await repository
      .createQueryBuilder('event')
      .where('event.status = :status', { status: OutboxEventStatus.PENDING })
      .andWhere(
        '(event.nextAttemptAt IS NULL OR event.nextAttemptAt <= :now)',
        { now },
      )
      .orderBy('event.createdAt', 'ASC')
      .take(limit)
      .getMany();

    const claimed: StoredEvent[] = [];

    for (const candidate of candidates) {
      const result = await repository
        .createQueryBuilder()
        .update(OutboxEvent)
        .set({ status: OutboxEventStatus.PROCESSING })
        .where('id = :id AND status = :status', {
          id: candidate.id,
          status: OutboxEventStatus.PENDING,
        })
        .execute();

      if (result.affected) {
        claimed.push({
          id: candidate.id,
          type: candidate.type as StoredEvent['type'],
          source: candidate.source,
          occurredAt: candidate.occurredAt.toISOString(),
          data: candidate.data as unknown as StoredEvent['data'],
          attempts: candidate.attempts,
        });
      }
    }

    return claimed;
  }

  async markPublished(id: string): Promise<void> {
    await this.dataSource.getRepository(OutboxEvent).update(id, {
      status: OutboxEventStatus.PUBLISHED,
      publishedAt: new Date(),
      lastError: null,
    });
  }

  async markFailed(
    id: string,
    attempts: number,
    error: string,
  ): Promise<void> {
    const nextAttempts = attempts + 1;
    const backoffMs = Math.min(
      2 ** nextAttempts * 1000,
      MAX_BACKOFF_MS,
    );

    await this.dataSource.getRepository(OutboxEvent).update(id, {
      status: OutboxEventStatus.PENDING,
      attempts: nextAttempts,
      nextAttemptAt: new Date(Date.now() + backoffMs),
      lastError: error.slice(0, 2000),
    });
  }

  async claim(
    consumer: string,
    eventId: string,
  ): Promise<IdempotencyClaim> {
    const repository = this.dataSource.getRepository(ProcessedEvent);
    const now = new Date();
    const lockedUntil = new Date(now.getTime() + LOCK_MS);
    const existing = await repository.findOne({
      where: { consumer, eventId },
    });

    if (!existing) {
      try {
        await repository.insert({
          consumer,
          eventId,
          status: ProcessedEventStatus.PROCESSING,
          lockedUntil,
          processedAt: null,
        });
        return 'acquired';
      } catch (error) {
        const message =
          error instanceof Error ? error.message : String(error);
        this.logger.warn(
          `Corrida ao reservar evento ${eventId}: ${message}`,
        );
        return 'locked';
      }
    }

    if (existing.status === ProcessedEventStatus.PROCESSED) {
      return 'processed';
    }

    if (existing.lockedUntil > now) {
      return 'locked';
    }

    const result = await repository
      .createQueryBuilder()
      .update(ProcessedEvent)
      .set({ lockedUntil })
      .where('id = :id AND status = :status AND lockedUntil <= :now', {
        id: existing.id,
        status: ProcessedEventStatus.PROCESSING,
        now,
      })
      .execute();

    return result.affected ? 'acquired' : 'locked';
  }

  async markProcessed(consumer: string, eventId: string): Promise<void> {
    await this.dataSource.getRepository(ProcessedEvent).update(
      { consumer, eventId },
      {
        status: ProcessedEventStatus.PROCESSED,
        processedAt: new Date(),
      },
    );
  }

  async release(consumer: string, eventId: string): Promise<void> {
    await this.dataSource
      .getRepository(ProcessedEvent)
      .delete({ consumer, eventId, status: ProcessedEventStatus.PROCESSING });
  }

  async purgePublishedBefore(publishedBefore: Date): Promise<number> {
    const result = await this.dataSource
      .getRepository(OutboxEvent)
      .createQueryBuilder()
      .delete()
      .from(OutboxEvent)
      .where('status = :status AND publishedAt IS NOT NULL AND publishedAt <= :publishedBefore', {
        status: OutboxEventStatus.PUBLISHED,
        publishedBefore,
      })
      .execute();

    return result.affected ?? 0;
  }

  async purgeProcessedBefore(processedBefore: Date): Promise<number> {
    const result = await this.dataSource
      .getRepository(ProcessedEvent)
      .createQueryBuilder()
      .delete()
      .from(ProcessedEvent)
      .where('status = :status AND processedAt IS NOT NULL AND processedAt <= :processedBefore', {
        status: ProcessedEventStatus.PROCESSED,
        processedBefore,
      })
      .execute();

    return result.affected ?? 0;
  }
}


