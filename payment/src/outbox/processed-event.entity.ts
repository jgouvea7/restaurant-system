import {
  Column,
  CreateDateColumn,
  Entity,
  PrimaryGeneratedColumn,
  Unique,
  UpdateDateColumn,
} from 'typeorm';

export enum ProcessedEventStatus {
  PROCESSING = 'processing',
  PROCESSED = 'processed',
}

@Entity('processed_events')
@Unique('UQ_processed_events_consumer_event', ['consumer', 'eventId'])
export class ProcessedEvent {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column()
  consumer!: string;

  @Column({ type: 'uuid' })
  eventId!: string;

  @Column({
    type: 'enum',
    enum: ProcessedEventStatus,
    default: ProcessedEventStatus.PROCESSING,
  })
  status!: ProcessedEventStatus;

  @Column({ type: 'timestamp', precision: 6 })
  lockedUntil!: Date;

  @Column({ type: 'timestamp', precision: 6, nullable: true })
  processedAt!: Date | null;

  @CreateDateColumn({ type: 'timestamp', precision: 6 })
  createdAt!: Date;

  @UpdateDateColumn({ type: 'timestamp', precision: 6 })
  updatedAt!: Date;
}
