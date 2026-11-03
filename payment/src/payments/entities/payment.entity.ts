import {
  Column,
  CreateDateColumn,
  Entity,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';

export enum PaymentStatus {
  APPROVED = 'approved',
  REJECTED = 'rejected',
}

@Entity('payments')
export class Payment {
  @PrimaryGeneratedColumn('uuid')
  paymentId!: string;

  @Column({ type: 'uuid', unique: true })
  orderId!: string;

  @Column({ type: 'numeric', precision: 10, scale: 2 })
  amount!: string;

  @Column()
  method!: string;

  @Column({ type: 'enum', enum: PaymentStatus })
  status!: PaymentStatus;

  @Column({ type: 'varchar', nullable: true })
  reason!: string | null;

  @CreateDateColumn({ type: 'timestamp', precision: 6 })
  createdAt!: Date;

  @UpdateDateColumn({ type: 'timestamp', precision: 6 })
  updatedAt!: Date;
}
