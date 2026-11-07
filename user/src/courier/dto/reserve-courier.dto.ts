import { IsUUID } from 'class-validator';

export class ReserveCourierDto {
  @IsUUID()
  orderId!: string;
  reason?: string;
}
