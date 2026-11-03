import { OrderStatus } from '../entities/order.entity';

export class UpdateOrderStatusDto {
  status!: OrderStatus;
}
