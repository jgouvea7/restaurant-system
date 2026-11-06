import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  InternalServerErrorException,
  Logger,
  NotFoundException,
  ServiceUnavailableException,
} from '@nestjs/common';
import { CreateRestaurantDto } from './dto/create-restaurant.dto';
import { UpdateRestaurantDto } from './dto/update-restaurant.dto';
import { DataSource, In } from 'typeorm';
import { Restaurant } from './entities/restaurant.entity';
import { GeolocationService } from '@restaurant/geolocation';
import {
  ELASTIC_CACHE_KEYS,
  ElastiCacheService,
  EVENT_TYPES,
  EventPublisherService,
} from '@restaurant/aws';
import { RestaurantAddress } from '../restaurant-address/entities/restaurant-address.entity';
import { RestaurantAccessService } from './restaurant-access.service';

export interface FindNearbyRestaurantsInput {
  latitude: number;
  longitude: number;
  radiusKm?: number;
  limit?: number;
}

export type NearbyRestaurant = Restaurant & { distanceKm: number };

@Injectable()
export class RestaurantsService {
  private readonly logger = new Logger(RestaurantsService.name);

  constructor(
    private readonly dataSource: DataSource,
    private readonly geolocationService: GeolocationService,
    private readonly elastiCacheService: ElastiCacheService,
    private readonly eventPublisher: EventPublisherService,
    private readonly restaurantAccess: RestaurantAccessService,
  ) {}

  async create(dto: CreateRestaurantDto, ownerId: string | null) {
    if (!ownerId) {
      throw new ForbiddenException('Owner sem vinculo');
    }

    await this.ensureOwnerExists(ownerId);

    const restaurantAddressData =
      await this.geolocationService.findAddressByCep(
        dto.restaurantAddress.postalCode,
      );

    if (!restaurantAddressData) {
      throw new BadRequestException('CEP nao encontrado');
    }

    const coordinates = await this.geolocationService.findCordByAddress({
      street: restaurantAddressData.logradouro,
      number: dto.restaurantAddress.number,
      city: restaurantAddressData.localidade,
      state: restaurantAddressData.uf,
    });

    if (!coordinates) {
      throw new BadRequestException(
        'Nao foi possivel geocodificar o endereco do restaurante',
      );
    }

    const result = await this.dataSource.transaction(async (manager) => {
      const restaurant = manager.create(Restaurant, {
        name: dto.name,
        slug: dto.slug,
        description: dto.description,
        phone: dto.phone,
        ownerUserId: ownerId,
      });

      await manager.save(restaurant);

      const addressRestaurant = manager.create(RestaurantAddress, {
        street: restaurantAddressData.logradouro,
        number: dto.restaurantAddress.number,
        city: restaurantAddressData.localidade,
        state: restaurantAddressData.uf,
        postalCode: dto.restaurantAddress.postalCode,
        latitude: coordinates.latitude,
        longitude: coordinates.longitude,
        restaurant,
      });

      await manager.save(addressRestaurant);

      await this.eventPublisher.publish(
        EVENT_TYPES.RESTAURANT_CREATED,
        {
          restaurantId: restaurant.id,
          name: restaurant.name,
          slug: restaurant.slug,
          ownerUserId: restaurant.ownerUserId,
          latitude: coordinates.latitude,
          longitude: coordinates.longitude,
        },
        'restaurant',
        manager,
      );

      return { restaurant, addressRestaurant };
    });

    await this.indexRestaurantLocation(
      result.restaurant.id,
      result.addressRestaurant,
    );

    return result;
  }

  private async ensureOwnerExists(ownerUserId: string): Promise<void> {
    const baseUrl = (
      process.env.USER_SERVICE_URL ?? 'http://floci:8080'
    ).replace(/\/$/, '');

    let response: Response;

    try {
      response = await fetch(
        `${baseUrl}/owner/${encodeURIComponent(ownerUserId)}`,
        { signal: AbortSignal.timeout(5000) },
      );
    } catch {
      throw new ServiceUnavailableException(
        'Nao foi possivel consultar o servico de usuarios',
      );
    }

    if (response.status === 404) {
      throw new NotFoundException('Owner nao encontrado');
    }

    if (!response.ok) {
      throw new InternalServerErrorException(
        `Erro ao consultar owner: ${response.status}`,
      );
    }
  }

  private async indexRestaurantLocation(
    restaurantId: string,
    address: RestaurantAddress,
  ): Promise<void> {
    const latitude = Number(address.latitude);
    const longitude = Number(address.longitude);

    if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) {
      return;
    }

    try {
      await this.elastiCacheService.addLocation(
        ELASTIC_CACHE_KEYS.RESTAURANTS_GEO,
        {
          member: restaurantId,
          longitude,
          latitude,
        },
      );
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      this.logger.warn(
        `Nao foi possivel indexar o restaurante ${restaurantId} no Redis GEO: ${message}`,
      );
    }
  }

  async findNearby(
    input: FindNearbyRestaurantsInput,
  ): Promise<NearbyRestaurant[]> {
    const latitude = Number(input.latitude);
    const longitude = Number(input.longitude);
    const radiusKm = Number(input.radiusKm ?? 5);
    const limit = Math.trunc(Number(input.limit ?? 20));

    if (!Number.isFinite(latitude) || latitude < -90 || latitude > 90) {
      throw new BadRequestException('latitude invalida');
    }

    if (!Number.isFinite(longitude) || longitude < -180 || longitude > 180) {
      throw new BadRequestException('longitude invalida');
    }

    if (!Number.isFinite(radiusKm) || radiusKm <= 0) {
      throw new BadRequestException('radiusKm invalido');
    }

    if (!Number.isFinite(limit) || limit < 1) {
      throw new BadRequestException('limit invalido');
    }

    const nearby = await this.elastiCacheService.findNearby(
      ELASTIC_CACHE_KEYS.RESTAURANTS_GEO,
      {
        latitude,
        longitude,
        radiusKm,
        limit: Math.min(limit, 100),
      },
    );

    if (nearby.length === 0) {
      return [];
    }

    const restaurants = await this.dataSource
      .getRepository(Restaurant)
      .find({ where: { id: In(nearby.map((item) => item.member)) } });

    const restaurantsById = new Map(
      restaurants.map((restaurant) => [restaurant.id, restaurant]),
    );

    return nearby.flatMap((item) => {
      const restaurant = restaurantsById.get(item.member);

      if (!restaurant) {
        return [];
      }

      return [{ ...restaurant, distanceKm: item.distanceKm }];
    });
  }

  findAll() {
    return this.dataSource.getRepository(Restaurant).find();
  }

  findOwnerById(ownerId: string) {
    return this.dataSource.getRepository(Restaurant).find({
      where: { ownerUserId: ownerId },
      select: {
        id: true,
        name: true,
      }
    })
  }

  findOne(restaurantId: string) {
    return this.dataSource.getRepository(Restaurant).find({
      where : { id: restaurantId }
    });
  }

  async updateForOwner(
    id: string,
    updateRestaurantDto: UpdateRestaurantDto,
    ownerId: string | null,
  ) {
    await this.restaurantAccess.findByOwnerOrFail(id, ownerId);
    return this.update(id, updateRestaurantDto);
  }

  private update(id: string, updateRestaurantDto: UpdateRestaurantDto) {
    return `This action updates a #${id} restaurant`;
  }

  async removeForOwner(id: string, ownerId: string | null) {
    await this.restaurantAccess.findByOwnerOrFail(id, ownerId);
    return this.remove(id);
  }

  async remove(id: string) {
    const repository = this.dataSource.getRepository(Restaurant);
    const restaurant = await repository.findOne({ where: { id } });
    const result = await repository.delete(id);

    try {
      await this.elastiCacheService.removeLocation(
        ELASTIC_CACHE_KEYS.RESTAURANTS_GEO,
        id,
      );
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      this.logger.warn(
        `Nao foi possivel remover o restaurante ${id} do Redis GEO: ${message}`,
      );
    }

    await this.eventPublisher.publish(
      EVENT_TYPES.RESTAURANT_DELETED,
      { restaurantId: id, name: restaurant?.name ?? null },
      'restaurant',
    );

    return result;
  }
}
