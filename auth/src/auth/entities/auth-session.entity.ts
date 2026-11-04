import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';
import { AuthRole } from '@restaurant/geolocation';

@Entity('auth_sessions')
export class AuthSession {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Index()
  @Column({ type: 'uuid' })
  userId!: string;

  @Column()
  email!: string;

  @Column({ type: 'jsonb' })
  roles!: AuthRole[];

  @Column({ type: 'uuid', nullable: true })
  ownerId!: string | null;

  @Column({ type: 'uuid', nullable: true })
  courierId!: string | null;

  @Column({ type: 'uuid', nullable: true })
  costumerId!: string | null;

  @Column({ unique: true, length: 64 })
  refreshTokenHash!: string;

  @Column({ type: 'timestamp', precision: 6 })
  expiresAt!: Date;

  @Column({ type: 'timestamp', precision: 6, nullable: true })
  revokedAt!: Date | null;

  @CreateDateColumn({ type: 'timestamp', precision: 6 })
  createdAt!: Date;

  @UpdateDateColumn({ type: 'timestamp', precision: 6 })
  updatedAt!: Date;
}
