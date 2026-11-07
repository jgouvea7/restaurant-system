import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
  ServiceUnavailableException,
} from '@nestjs/common';
import * as bcrypt from 'bcrypt';
import { CreateCourierDto } from './dto/create-courier.dto';
import { DataSource, In, LessThanOrEqual } from 'typeorm';
import { User, userStatus } from 'src/users/entities/user.entity';
import {
  Courier,
  CourierAssignmentStatus,
  CourierAvailability,
  VehicleType,
} from './entities/courier.entity';
import {
  ELASTIC_CACHE_KEYS,
  ElastiCacheService,
  EVENT_TYPES,
  EventPublisherService,
} from '@restaurant/aws';
import {
  AUTH_ROLES,
  buildPage,
  decodeCursor,
  resolvePageLimit,
  type CursorPage,
} from '@restaurant/geolocation';
import type { AuthenticatedUser } from '@restaurant/geolocation';

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

export interface PublicCourier {
  courierId: string;
  vehicleType: VehicleType;
  available: CourierAvailability;
  user: {
    id: string;
    firstName: string;
    lastName: string;
    email: string;
    status: string;
  } | null;
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
        reservedForOrderId: null,
        reservedAt: null,
        reservationStatus: null,
        reservationExpiresAt: null,
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

  async updateCourierStatus(
    courierId: string,
    requesterCourierId: string | null,
  ) {
    this.assertSameCourier(courierId, requesterCourierId);

    const courier = await this.findCourier(courierId);

    return this.applyAvailability(
      courier,
      courier.available !== CourierAvailability.AVAILABLE,
    );
  }

  async setCourierAvailability(
    courierId: string,
    requesterCourierId: string | null,
    available: boolean,
  ) {
    this.assertSameCourier(courierId, requesterCourierId);

    if (typeof available !== 'boolean') {
      throw new BadRequestException('available deve ser booleano');
    }

    const courier = await this.findCourier(courierId);

    return this.applyAvailability(courier, available);
  }

  async reserveCourier(courierId: string, orderId: string) {
    if (!orderId) {
      throw new BadRequestException('orderId e obrigatorio');
    }

    const courier = await this.findCourier(courierId);

    if (courier.reservedForOrderId === orderId) {
      return this.reservationResult(courier, orderId);
    }

    if (
      courier.reservedForOrderId ||
      courier.available !== CourierAvailability.AVAILABLE
    ) {
      throw new ConflictException('Entregador indisponivel');
    }

    const reservedAt = new Date();
    const expiresAt = new Date(
      reservedAt.getTime() + this.reservationTtlSeconds() * 1000,
    );
    const result = await this.dataSource
      .getRepository(Courier)
      .createQueryBuilder()
      .update(Courier)
      .set({
        available: CourierAvailability.UNAVAILABLE,
        reservedForOrderId: orderId,
        reservedAt,
        reservationStatus: CourierAssignmentStatus.PENDING,
        reservationExpiresAt: expiresAt,
      })
      .where(
        'courierId = :courierId AND available = :available AND reservedForOrderId IS NULL',
        {
          courierId,
          available: CourierAvailability.AVAILABLE,
        },
      )
      .execute();

    if (!result.affected) {
      throw new ConflictException('Entregador indisponivel');
    }

    await this.removeFromAvailableSet(courierId);
    await this.eventPublisher.publish(
      EVENT_TYPES.COURIER_AVAILABILITY_CHANGED,
      { courierId, available: false },
      'user',
    );
    await this.eventPublisher.publish(
      EVENT_TYPES.COURIER_ASSIGNMENT_OFFERED,
      { courierId, orderId, expiresAt: expiresAt.toISOString() },
      'user',
    );

    return {
      courierId,
      orderId,
      available: CourierAvailability.UNAVAILABLE,
      reservedAt: reservedAt.toISOString(),
      reservationStatus: CourierAssignmentStatus.PENDING,
      expiresAt: expiresAt.toISOString(),
    };
  }

  async acceptAssignment(
    courierId: string,
    requesterCourierId: string | null,
    orderId: string,
  ) {
    this.assertSameCourier(courierId, requesterCourierId);

    if (!orderId) {
      throw new BadRequestException('orderId e obrigatorio');
    }

    const courier = await this.findCourier(courierId);

    if (courier.reservedForOrderId !== orderId) {
      throw new ConflictException('Entregador nao reservado para este pedido');
    }

    if (courier.reservationStatus === CourierAssignmentStatus.ACCEPTED) {
      return this.reservationResult(courier, orderId);
    }

    if (
      courier.reservationExpiresAt &&
      courier.reservationExpiresAt.getTime() <= Date.now()
    ) {
      await this.releaseExpiredReservation(courier);
      throw new ConflictException('Reserva expirada');
    }

    courier.reservationStatus = CourierAssignmentStatus.ACCEPTED;
    courier.reservationExpiresAt = null;
    await this.dataSource.getRepository(Courier).save(courier);

    const acceptedAt = new Date();
    await this.eventPublisher.publish(
      EVENT_TYPES.COURIER_ASSIGNMENT_ACCEPTED,
      { courierId, orderId, acceptedAt: acceptedAt.toISOString() },
      'user',
    );

    return {
      courierId,
      orderId,
      reservationStatus: CourierAssignmentStatus.ACCEPTED,
      acceptedAt: acceptedAt.toISOString(),
    };
  }

  async rejectAssignment(
    courierId: string,
    requesterCourierId: string | null,
    orderId: string,
    reason?: string,
  ) {
    this.assertSameCourier(courierId, requesterCourierId);

    if (!orderId) {
      throw new BadRequestException('orderId e obrigatorio');
    }

    const courier = await this.findCourier(courierId);

    if (!courier.reservedForOrderId) {
      return { courierId, orderId, released: false };
    }

    if (courier.reservedForOrderId !== orderId) {
      throw new ConflictException('Entregador reservado para outro pedido');
    }

    await this.releaseReservation(courier);
    await this.eventPublisher.publish(
      EVENT_TYPES.COURIER_ASSIGNMENT_REJECTED,
      { courierId, orderId, reason: reason ?? null },
      'user',
    );

    return {
      courierId,
      orderId,
      released: true,
      reservationStatus: CourierAssignmentStatus.REJECTED,
    };
  }

  async releaseExpiredReservations(now = new Date()): Promise<number> {
    const expired = await this.dataSource.getRepository(Courier).find({
      where: {
        reservationStatus: CourierAssignmentStatus.PENDING,
        reservationExpiresAt: LessThanOrEqual(now),
      },
    });

    let released = 0;

    for (const courier of expired) {
      if (!courier.reservedForOrderId) {
        continue;
      }

      const orderId = courier.reservedForOrderId;
      await this.releaseExpiredReservation(courier);
      released += 1;
      this.logger.warn(
        `Reserva expirada do entregador ${courier.courierId} para o pedido ${orderId}`,
      );
    }

    return released;
  }

  async releaseCourier(
    courierId: string,
    orderId: string,
    requester?: AuthenticatedUser,
  ) {
    if (!orderId) {
      throw new BadRequestException('orderId e obrigatorio');
    }

    if (
      requester &&
      !requester.roles.includes(AUTH_ROLES.OWNER) &&
      requester.roles.includes(AUTH_ROLES.COURIER)
    ) {
      this.assertSameCourier(courierId, requester.courierId);
    }

    const courier = await this.findCourier(courierId);

    if (courier.reservedForOrderId && courier.reservedForOrderId !== orderId) {
      throw new ConflictException('Entregador reservado para outro pedido');
    }

    if (!courier.reservedForOrderId) {
      return {
        courierId,
        orderId,
        available: courier.available,
        released: false,
      };
    }

    courier.reservedForOrderId = null;
    courier.reservedAt = null;
    courier.reservationStatus = null;
    courier.reservationExpiresAt = null;
    const released = await this.applyAvailability(courier, true);

    return {
      courierId,
      orderId,
      available: CourierAvailability.AVAILABLE,
      released: true,
    };
  }

  async updateLocation(
    courierId: string,
    requesterCourierId: string | null,
    latitude: number,
    longitude: number,
  ) {
    this.assertSameCourier(courierId, requesterCourierId);

    const courier = await this.findCourier(courierId);
    this.validateCoordinates(latitude, longitude);

    try {
      await this.elastiCacheService.addLocation(
        ELASTIC_CACHE_KEYS.COURIERS_GEO,
        {
          member: courierId,
          latitude,
          longitude,
        },
      );

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

  async getAllCourierUsers(
    limitValue?: string | number,
    cursorValue?: string,
  ): Promise<CursorPage<PublicCourier>> {
    const limit = resolvePageLimit(limitValue);
    const cursor = decodeCursor(cursorValue);

    if (cursorValue && !cursor) {
      throw new BadRequestException('cursor invalido');
    }

    const query = this.dataSource
      .getRepository(Courier)
      .createQueryBuilder('courier')
      .innerJoinAndSelect('courier.user', 'user')
      .orderBy('user.createdAt', 'DESC')
      .addOrderBy('user.id', 'DESC')
      .take(limit + 1);

    if (cursor) {
      query.andWhere('(user.createdAt, user.id) < (:createdAt, :id)', {
        createdAt: cursor.createdAt,
        id: cursor.id,
      });
    }

    const rows = await query.getMany();
    const page = buildPage(rows, limit, (courier) => ({
      createdAt: courier.user?.createdAt ?? new Date(0),
      id: courier.user?.id ?? courier.courierId,
    }));

    return {
      items: page.items.map((courier) => this.toPublicCourier(courier)),
      nextCursor: page.nextCursor,
    };
  }

  private toPublicCourier(courier: Courier): PublicCourier {
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

  private assertSameCourier(
    courierId: string,
    requesterCourierId: string | null,
  ): void {
    if (!requesterCourierId || requesterCourierId !== courierId) {
      throw new ForbiddenException('Entregador de outro usuario');
    }
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

  private reservationResult(courier: Courier, orderId: string) {
    return {
      courierId: courier.courierId,
      orderId,
      available: courier.available,
      reservedAt: courier.reservedAt?.toISOString() ?? null,
      reservationStatus: courier.reservationStatus,
      expiresAt: courier.reservationExpiresAt?.toISOString() ?? null,
    };
  }

  private async releaseReservation(courier: Courier): Promise<void> {
    courier.reservedForOrderId = null;
    courier.reservedAt = null;
    courier.reservationStatus = null;
    courier.reservationExpiresAt = null;

    await this.applyAvailability(courier, true);
  }

  private async releaseExpiredReservation(courier: Courier): Promise<void> {
    if (!courier.reservedForOrderId) {
      return;
    }

    const orderId = courier.reservedForOrderId;
    const expiredAt = new Date();

    await this.releaseReservation(courier);
    await this.eventPublisher.publish(
      EVENT_TYPES.COURIER_ASSIGNMENT_EXPIRED,
      {
        courierId: courier.courierId,
        orderId,
        expiredAt: expiredAt.toISOString(),
      },
      'user',
    );
  }

  private reservationTtlSeconds(): number {
    const configured = Number(
      process.env.COURIER_RESERVATION_TTL_SECONDS ?? 120,
    );

    return Number.isFinite(configured) && configured > 0
      ? Math.trunc(configured)
      : 120;
  }

  private async removeFromAvailableSet(courierId: string): Promise<void> {
    try {
      await this.elastiCacheService.removeFromSet(
        ELASTIC_CACHE_KEYS.COURIERS_AVAILABLE,
        courierId,
      );
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      this.logger.warn(
        `Nao foi possivel remover o entregador ${courierId} da lista de disponiveis: ${message}`,
      );
    }
  }

  private async applyAvailability(
    courier: Courier,
    available: boolean,
  ): Promise<Courier> {
    if (available && courier.reservedForOrderId) {
      throw new BadRequestException('Entregador reservado para um pedido');
    }

    const target = available
      ? CourierAvailability.AVAILABLE
      : CourierAvailability.UNAVAILABLE;

    const query = this.dataSource
      .getRepository(Courier)
      .createQueryBuilder()
      .update(Courier)
      .set({ available: target })
      .where('courierId = :courierId', { courierId: courier.courierId });

    if (available) {
      query.andWhere('reservedForOrderId IS NULL');
    }

    const result = await query.execute();

    if (!result.affected) {
      if (available) {
        throw new BadRequestException('Entregador reservado para um pedido');
      }

      throw new NotFoundException('Entregador nao encontrado');
    }

    courier.available = target;
    await this.syncAvailabilityCache(courier.courierId, available);
    await this.eventPublisher.publish(
      EVENT_TYPES.COURIER_AVAILABILITY_CHANGED,
      { courierId: courier.courierId, available },
      'user',
    );

    return courier;
  }

  private async syncAvailabilityCache(
    courierId: string,
    available: boolean,
  ): Promise<void> {
    try {
      if (available) {
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
      this.logger.warn(
        `Nao foi possivel sincronizar a disponibilidade do entregador ${courierId} no Redis: ${message}`,
      );
    }
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
