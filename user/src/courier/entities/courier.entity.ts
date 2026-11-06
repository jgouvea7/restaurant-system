import { User } from 'src/users/entities/user.entity';
import {
  Column,
  Entity,
  JoinColumn,
  PrimaryGeneratedColumn,
  OneToOne,
} from 'typeorm';

export enum VehicleType {
  CAR = 'car',
  MOTO = 'moto',
  BYCICLE = 'bycicle',
}

export enum CourierAvailability {
  AVAILABLE = 'available',
  UNAVAILABLE = 'unavailable',
}

export enum CourierAssignmentStatus {
  PENDING = 'pending',
  ACCEPTED = 'accepted',
  REJECTED = 'rejected',
}

@Entity()
export class Courier {
  @PrimaryGeneratedColumn('uuid')
  courierId!: string;

  @Column()
  vehicleType!: VehicleType;

  @Column()
  available!: CourierAvailability;

  @Column({ type: 'uuid', nullable: true })
  reservedForOrderId!: string | null;

  @Column({ type: 'timestamp', precision: 6, nullable: true })
  reservedAt!: Date | null;

  @Column({ type: 'varchar', nullable: true })
  reservationStatus!: CourierAssignmentStatus | null;

  @Column({ type: 'timestamp', precision: 6, nullable: true })
  reservationExpiresAt!: Date | null;

  @OneToOne(() => User, (user) => user.courier)
  @JoinColumn({ name: 'user_id' })
  user!: User;
}
