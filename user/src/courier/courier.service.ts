import {
  BadRequestException,
  Injectable,
  Logger,
  NotFoundException,
  ServiceUnavailableException,
} from '@nestjs/common';
import * as bcrypt from 'bcrypt';
import { CreateCourierDto } from './dto/create-courier.dto';
import { DataSource, In } from 'typeorm';
import { User, userStatus } from 'src/users/entities/user.entity';
import {
  Courier,
  CourierAvailability,
  VehicleType,
} from './entities/courier.entity';
import {
  ELASTIC_CACHE_KEYS,
  ElastiCacheService,
  EVENT_TYPES,
  EventPublisherService,
} from '@restaurant/aws';

export interface FindNearbyCouriersInput {
  latitude: number;
  longitude: number;
  radiusKm?: number;
  limit?: number;
}

export interface NearbyCourier {
  courierId: string;
  vehicleType: VehicleType;
  distanceKm: number;
}

@Injectable()
export class CourierService {
  private readonly logger = new Logger(CourierService.name);

  constructor(
    private readonly dataSource: DataSource,
    private readonly elastiCacheService: ElastiCacheService,
    private readonly eventPublisher: EventPublisherService,
  ) {}

  async createUserCourier(dto: CreateCourierDto) {
    return this.dataSource.transaction(async (manager) => {
      const hashedPassowrd = await bcrypt.hash(dto.password, 12);

      const user = manager.create(User, {
        firstName: dto.firstName,
        lastName: dto.lastName,
        email: dto.email.trim().toLowerCase(),
        password: hashedPassowrd,
        status: userStatus.ACTIVE,
      });

      await manager.save(user);

      const courierUser = manager.create(Courier, {
        vehicleType: dto.courier.vehicleType,
        available: CourierAvailability.UNAVAILABLE,
        user: user,
      });

      await manager.save(courierUser);

      return {
        user: {
          id: user.id,
          firstName: user.firstName,
          lastName: user.lastName,
          email: user.email,
          status: user.status,
        },
        courierUser: {
          courierId: courierUser.courierId,
          vehicleType: courierUser.vehicleType,
          available: courierUser.available,
        },
      };
    });
  }

  async updateCourierStatus(courierId: string) {
    const courier = await this.findCourier(courierId);

    return this.applyAvailability(
      courier,
      courier.available !== CourierAvailability.AVAILABLE,
    );
  }

  async setCourierAvailability(courierId: string, available: boolean) {
    if (typeof available !== 'boolean') {
      throw new BadRequestException('available deve ser booleano');
    }

    const courier = await this.findCourier(courierId);

    return this.applyAvailability(courier, available);
  }

  async updateLocation(
    courierId: string,
    latitude: number,
    longitude: number,
  ) {
    const courier = await this.findCourier(courierId);
    this.validateCoordinates(latitude, longitude);

    try {
      await this.elastiCacheService.addLocation(ELASTIC_CACHE_KEYS.COURIERS_GEO, {
        member: courierId,
        latitude,
        longitude,
      });

      if (courier.available === CourierAvailability.AVAILABLE) {
        await this.elastiCacheService.addToSet(
          ELASTIC_CACHE_KEYS.COURIERS_AVAILABLE,
          courierId,
        );
      } else {
        await this.elastiCacheService.removeFromSet(
          ELASTIC_CACHE_KEYS.COURIERS_AVAILABLE,
          courierId,
        );
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      this.logger.error(
        `Falha ao atualizar a localizacao do entregador ${courierId}: ${message}`,
      );
      throw new ServiceUnavailableException(
        'Nao foi possivel atualizar a localizacao no cache',
      );
    }

    await this.eventPublisher.publish(
      EVENT_TYPES.COURIER_LOCATION_UPDATED,
      {
        courierId,
        latitude,
        longitude,
        available: courier.available === CourierAvailability.AVAILABLE,
      },
      'user',
    );

    return { courierId, latitude, longitude };
  }

  async getCourierLocation(courierId: string) {
    await this.findCourier(courierId);

    return this.elastiCacheService.getPosition(
      ELASTIC_CACHE_KEYS.COURIERS_GEO,
      courierId,
    );
  }

  async findNearbyAvailable(
    input: FindNearbyCouriersInput,
  ): Promise<NearbyCourier[]> {
    const latitude = Number(input.latitude);
    const longitude = Number(input.longitude);
    const radiusKm = Number(input.radiusKm ?? 5);
    const limit = Math.trunc(Number(input.limit ?? 20));

    this.validateCoordinates(latitude, longitude);

    if (!Number.isFinite(radiusKm) || radiusKm <= 0) {
      throw new BadRequestException('radiusKm invalido');
    }

    if (!Number.isFinite(limit) || limit < 1) {
      throw new BadRequestException('limit invalido');
    }

    const searchLimit = Math.min(Math.max(limit * 3, limit), 100);

    let nearby: Awaited<ReturnType<ElastiCacheService['findNearby']>>;
    let availableIds: string[];

    try {
      [nearby, availableIds] = await Promise.all([
        this.elastiCacheService.findNearby(ELASTIC_CACHE_KEYS.COURIERS_GEO, {
          latitude,
          longitude,
          radiusKm,
          limit: searchLimit,
        }),
        this.elastiCacheService.getSetMembers(
          ELASTIC_CACHE_KEYS.COURIERS_AVAILABLE,
        ),
      ]);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      this.logger.error(`Falha ao buscar entregadores proximos: ${message}`);
      throw new ServiceUnavailableException(
        'Nao foi possivel buscar entregadores no cache',
      );
    }

    const available = new Set(availableIds);
    const filtered = nearby
      .filter((item) => available.has(item.member))
      .slice(0, limit);

    if (filtered.length === 0) {
      return [];
    }

    const couriers = await this.dataSource.getRepository(Courier).find({
      where: { courierId: In(filtered.map((item) => item.member)) },
      select: { courierId: true, vehicleType: true },
    });

    const couriersById = new Map(
      couriers.map((courier) => [courier.courierId, courier]),
    );

    return filtered.flatMap((item) => {
      const courier = couriersById.get(item.member);

      if (!courier) {
        return [];
      }

      return [
        {
          courierId: courier.courierId,
          vehicleType: courier.vehicleType,
          distanceKm: item.distanceKm,
        },
      ];
    });
  }

  async findCourierById(courierId: string) {
    const courier = await this.dataSource.getRepository(Courier).findOne({
      where: { courierId },
      relations: {
        user: true,
      },
    });

    if (!courier) {
      throw new NotFoundException('Entregador nao encontrado');
    }

    return this.toPublicCourier(courier);
  }

  async getAllCourierUsers() {
    const couriers = await this.dataSource.getRepository(Courier).find({
      relations: {
        user: true,
      },
    });

    return couriers.map((courier) => this.toPublicCourier(courier));
  }

  private toPublicCourier(courier: Courier) {
    return {
      courierId: courier.courierId,
      vehicleType: courier.vehicleType,
      available: courier.available,
      user: courier.user
        ? {
            id: courier.user.id,
            firstName: courier.user.firstName,
            lastName: courier.user.lastName,
            email: courier.user.email,
            status: courier.user.status,
          }
        : null,
    };
  }

  private async findCourier(courierId: string): Promise<Courier> {
    const courier = await this.dataSource.getRepository(Courier).findOne({
      where: { courierId },
    });

    if (!courier) {
      throw new NotFoundException('Entregador nao encontrado');
    }

    return courier;
  }

  private async applyAvailability(
    courier: Courier,
    available: boolean,
  ): Promise<Courier> {
    courier.available = available
      ? CourierAvailability.AVAILABLE
      : CourierAvailability.UNAVAILABLE;

    await this.dataSource.getRepository(Courier).save(courier);

    try {
      if (available) {
        await this.elastiCacheService.addToSet(
          ELASTIC_CACHE_KEYS.COURIERS_AVAILABLE,
          courier.courierId,
        );
      } else {
        await this.elastiCacheService.removeFromSet(
          ELASTIC_CACHE_KEYS.COURIERS_AVAILABLE,
          courier.courierId,
        );
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      this.logger.warn(
        `Nao foi possivel sincronizar a disponibilidade do entregador ${courier.courierId} no Redis: ${message}`,
      );
    }

    await this.eventPublisher.publish(
      EVENT_TYPES.COURIER_AVAILABILITY_CHANGED,
      { courierId: courier.courierId, available },
      'user',
    );

    return courier;
  }

  private validateCoordinates(latitude: number, longitude: number): void {
    if (!Number.isFinite(latitude) || latitude < -90 || latitude > 90) {
      throw new BadRequestException('latitude invalida');
    }

    if (!Number.isFinite(longitude) || longitude < -180 || longitude > 180) {
      throw new BadRequestException('longitude invalida');
    }
  }
}
