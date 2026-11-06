import {
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { DataSource } from 'typeorm';
import { Restaurant } from './entities/restaurant.entity';

@Injectable()
export class RestaurantAccessService {
  constructor(private readonly dataSource: DataSource) {}

  async findByOwnerOrFail(
    restaurantId: string,
    ownerId: string | null,
  ): Promise<Restaurant> {
    if (!ownerId) {
      throw new ForbiddenException('Owner sem vinculo');
    }

    const restaurant = await this.dataSource
      .getRepository(Restaurant)
      .findOne({ where: { id: restaurantId } });

    if (!restaurant) {
      throw new NotFoundException('Restaurante nao encontrado');
    }

    if (restaurant.ownerUserId !== ownerId) {
      throw new ForbiddenException('Restaurante de outro owner');
    }

    return restaurant;
  }

  async isOwnedBy(
    restaurantId: string,
    ownerId: string | null,
  ): Promise<boolean> {
    if (!ownerId) {
      return false;
    }

    const count = await this.dataSource
      .getRepository(Restaurant)
      .count({ where: { id: restaurantId, ownerUserId: ownerId } });

    return count > 0;
  }

  async listIdsByOwner(ownerId: string | null): Promise<string[]> {
    if (!ownerId) {
      return [];
    }

    const restaurants = await this.dataSource.getRepository(Restaurant).find({
      where: { ownerUserId: ownerId },
      select: { id: true },
    });

    return restaurants.map((restaurant) => restaurant.id);
  }
}
