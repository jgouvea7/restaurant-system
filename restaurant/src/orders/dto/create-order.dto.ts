export class CreateOrderItemDto {
  productId!: string;
  quantity!: number;
}

export class CreateOrderDto {
  restaurantId!: string;
  costumerUserId!: string;
  paymentMethod!: string;
  deliveryAddress?: string;
  items!: CreateOrderItemDto[];
}
