import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryColumn,
  UpdateDateColumn,
} from 'typeorm';

export enum OutboxEventStatus {
  PENDING = 'pending',
  PROCESSING = 'processing',
  PUBLISHED = 'published',
}

@Entity('outbox_events')
@Index('IDX_outbox_events_pending', ['status', 'nextAttemptAt'])
@Index('IDX_outbox_events_processing', ['status', 'updatedAt'])
export class OutboxEvent {
  @PrimaryColumn('uuid')
  id!: string;

  @Column()
  type!: string;

  @Column()
  source!: string;

  @Column({ type: 'jsonb' })
  data!: object;

  @Column({ type: 'timestamp', precision: 6 })
  occurredAt!: Date;

  @Column({
    type: 'enum',
    enum: OutboxEventStatus,
    default: OutboxEventStatus.PENDING,
  })
  status!: OutboxEventStatus;

  @Column({ type: 'int', default: 0 })
  attempts!: number;

  @Column({ type: 'timestamp', precision: 6, nullable: true })
  nextAttemptAt!: Date | null;

  @Column({ type: 'text', nullable: true })
  lastError!: string | null;

  @Column({ type: 'timestamp', precision: 6, nullable: true })
  publishedAt!: Date | null;

  @CreateDateColumn({ type: 'timestamp', precision: 6 })
  createdAt!: Date;

  @UpdateDateColumn({ type: 'timestamp', precision: 6 })
  updatedAt!: Date;
}

