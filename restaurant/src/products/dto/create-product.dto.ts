export class CreateProductDto {
  name!: string;
  description?: string;
  price!: number;
  imageUrl?: string;
  isAvailable?: boolean;
  isActive?: boolean;
  preparationTimeMinutes?: number;
  restaurantId!: string;
}
