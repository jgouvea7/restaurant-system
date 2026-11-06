import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  InternalServerErrorException,
  Logger,
  NotFoundException,
  ServiceUnavailableException,
} from '@nestjs/common';
import { DataSource, FindOptionsWhere, In } from 'typeorm';
import {
  EVENT_TYPES,
  EventPublisherService,
} from '@restaurant/aws';
import { AUTH_ROLES } from '@restaurant/geolocation';
import type { AuthenticatedUser } from '@restaurant/geolocation';
import { CreateOrderDto } from './dto/create-order.dto';
import { OrderItem } from './entities/order-item.entity';
import { Order, OrderStatus } from './entities/order.entity';
import { Product } from '../products/entities/product.entity';
import { Restaurant } from '../restaurants/entities/restaurant.entity';
import { RestaurantAddress } from '../restaurant-address/entities/restaurant-address.entity';
import { RestaurantAccessService } from '../restaurants/restaurant-access.service';

interface NearbyCourier {
  courierId: string;
  distanceKm: number;
}

interface CourierDetails {
  courierId: string;
  available: string;
}

const ALLOWED_TRANSITIONS: Record<OrderStatus, OrderStatus[]> = {
  [OrderStatus.PENDING_PAYMENT]: [
    OrderStatus.CONFIRMED,
    OrderStatus.PAYMENT_REJECTED,
    OrderStatus.CANCELLED,
  ],
  [OrderStatus.CONFIRMED]: [OrderStatus.PREPARING, OrderStatus.CANCELLED],
  [OrderStatus.PREPARING]: [OrderStatus.READY, OrderStatus.CANCELLED],
  [OrderStatus.READY]: [OrderStatus.OUT_FOR_DELIVERY, OrderStatus.CANCELLED],
  [OrderStatus.OUT_FOR_DELIVERY]: [
    OrderStatus.DELIVERED,
    OrderStatus.CANCELLED,
  ],
  [OrderStatus.DELIVERED]: [],
  [OrderStatus.CANCELLED]: [],
  [OrderStatus.PAYMENT_REJECTED]: [],
};

@Injectable()
export class OrdersService {
  private readonly logger = new Logger(OrdersService.name);

  constructor(
    private readonly dataSource: DataSource,
    private readonly eventPublisher: EventPublisherService,
    private readonly restaurantAccess: RestaurantAccessService,
  ) {}

  async create(dto: CreateOrderDto, user: AuthenticatedUser) {
    this.validateCreateOrder(dto);

    if (!user.userId) {
      throw new ForbiddenException('Cliente sem vinculo');
    }

    const restaurant = await this.dataSource
      .getRepository(Restaurant)
      .findOne({ where: { id: dto.restaurantId } });

    if (!restaurant) {
      throw new NotFoundException('Restaurante nao encontrado');
    }

    const productIds = dto.items.map((item) => item.productId);
    const products = await this.dataSource.getRepository(Product).find({
      where: { id: In(productIds) },
      relations: { restaurant: true },
    });
    const productsById = new Map(
      products.map((product) => [product.id, product]),
    );

    const items = dto.items.map((item) => {
      const product = productsById.get(item.productId);

      if (!product || product.restaurant?.id !== dto.restaurantId) {
        throw new BadRequestException(
          `Produto ${item.productId} nao pertence ao restaurante`,
        );
      }

      if (!product.isActive || !product.isAvailable) {
        throw new BadRequestException(
          `Produto ${product.name} nao esta disponivel`,
        );
      }

      const quantity = Number(item.quantity);
      const unitPrice = Number(product.price);
      const subtotal = this.round(unitPrice * quantity);

      return {
        product,
        quantity,
        unitPrice,
        subtotal,
      };
    });

    const total = this.round(
      items.reduce((sum, item) => sum + item.subtotal, 0),
    );

    const order = await this.dataSource.transaction(async (manager) => {
      const entity = manager.create(Order, {
        restaurantId: dto.restaurantId,
        costumerUserId: user.userId,
        total: total.toFixed(2),
        status: OrderStatus.PENDING_PAYMENT,
        paymentMethod: dto.paymentMethod,
        deliveryAddress: dto.deliveryAddress ?? null,
        items: items.map((item) =>
          manager.create(OrderItem, {
            productId: item.product.id,
            productName: item.product.name,
            unitPrice: item.unitPrice.toFixed(2),
            quantity: item.quantity,
            subtotal: item.subtotal.toFixed(2),
          }),
        ),
      });

      const saved = await manager.save(entity);

      await this.eventPublisher.publish(
        EVENT_TYPES.ORDER_CREATED,
        {
          orderId: saved.id,
          restaurantId: saved.restaurantId,
          costumerUserId: saved.costumerUserId,
          total,
          paymentMethod: saved.paymentMethod,
          deliveryAddress: saved.deliveryAddress,
          items: items.map((item) => ({
            productId: item.product.id,
            productName: item.product.name,
            unitPrice: item.unitPrice,
            quantity: item.quantity,
            subtotal: item.subtotal,
          })),
        },
        'restaurant',
        manager,
      );

      return saved;
    });

    return order;
  }

  async findAllForUser(
    restaurantId: string | undefined,
    costumerUserId: string | undefined,
    user: AuthenticatedUser,
  ) {
    if (user.roles.includes(AUTH_ROLES.OWNER)) {
      if (!user.ownerId) {
        throw new ForbiddenException('Owner sem vinculo');
      }

      if (restaurantId) {
        await this.restaurantAccess.findByOwnerOrFail(
          restaurantId,
          user.ownerId,
        );
        return this.findAll(restaurantId, costumerUserId);
      }

      const restaurantIds = await this.restaurantAccess.listIdsByOwner(
        user.ownerId,
      );

      if (restaurantIds.length === 0) {
        return [];
      }

      return this.dataSource.getRepository(Order).find({
        where: {
          restaurantId: In(restaurantIds),
          ...(costumerUserId ? { costumerUserId } : {}),
        },
        order: { createdAt: 'DESC' },
      });
    }

    if (user.roles.includes(AUTH_ROLES.COSTUMER)) {
      if (costumerUserId && costumerUserId !== user.userId) {
        throw new ForbiddenException('Pedido de outro cliente');
      }

      return this.findAll(restaurantId, user.userId);
    }

    if (user.roles.includes(AUTH_ROLES.COURIER)) {
      if (!user.courierId) {
        throw new ForbiddenException('Entregador sem vinculo');
      }

      return this.findAll(restaurantId, costumerUserId, user.courierId);
    }

    throw new ForbiddenException('Permissao insuficiente');
  }

  findAll(
    restaurantId?: string,
    costumerUserId?: string,
    courierId?: string,
  ) {
    const where: FindOptionsWhere<Order> = {};

    if (restaurantId) {
      where.restaurantId = restaurantId;
    }

    if (costumerUserId) {
      where.costumerUserId = costumerUserId;
    }

    if (courierId) {
      where.courierId = courierId;
    }

    return this.dataSource.getRepository(Order).find({
      where,
      order: { createdAt: 'DESC' },
    });
  }

  async findOne(id: string) {
    const order = await this.dataSource
      .getRepository(Order)
      .findOne({ where: { id } });

    if (!order) {
      throw new NotFoundException('Pedido nao encontrado');
    }

    return order;
  }

  async findOneForUser(id: string, user: AuthenticatedUser) {
    const order = await this.findOne(id);
    await this.assertCanAccessOrder(order, user);
    return order;
  }

  async updateStatusForUser(
    id: string,
    status: OrderStatus,
    user: AuthenticatedUser,
    authorization?: string,
  ) {
    const order = await this.findOne(id);

    if (user.roles.includes(AUTH_ROLES.OWNER)) {
      if (!user.ownerId) {
        throw new ForbiddenException('Owner sem vinculo');
      }

      await this.restaurantAccess.findByOwnerOrFail(
        order.restaurantId,
        user.ownerId,
      );

      if (status === OrderStatus.OUT_FOR_DELIVERY && !order.courierId) {
        throw new BadRequestException(
          'Use a atribuicao de entregador para iniciar a entrega',
        );
      }

      return this.updateStatus(id, status, authorization);
    }

    if (user.roles.includes(AUTH_ROLES.COURIER)) {
      if (!user.courierId || order.courierId !== user.courierId) {
        throw new ForbiddenException('Pedido nao atribuido ao entregador');
      }

      if (status !== OrderStatus.DELIVERED) {
        throw new ForbiddenException(
          'Entregador so pode marcar o pedido como entregue',
        );
      }

      return this.updateStatus(id, status, authorization);
    }

    if (user.roles.includes(AUTH_ROLES.COSTUMER)) {
      if (order.costumerUserId !== user.userId) {
        throw new ForbiddenException('Pedido de outro cliente');
      }

      if (status !== OrderStatus.CANCELLED) {
        throw new ForbiddenException(
          'Cliente so pode cancelar o proprio pedido',
        );
      }

      return this.updateStatus(id, status, authorization);
    }

    throw new ForbiddenException('Permissao insuficiente');
  }

  async assignCourier(
    id: string,
    user: AuthenticatedUser,
    courierId?: string,
    authorization?: string,
  ) {
    if (!user.ownerId) {
      throw new ForbiddenException('Owner sem vinculo');
    }

    const order = await this.findOne(id);
    await this.restaurantAccess.findByOwnerOrFail(
      order.restaurantId,
      user.ownerId,
    );

    if (order.status === OrderStatus.OUT_FOR_DELIVERY && order.courierId) {
      return order;
    }

    if (order.status !== OrderStatus.READY) {
      throw new BadRequestException(
        'Pedido precisa estar pronto para receber um entregador',
      );
    }

    const selectedCourierId = courierId?.trim()
      ? await this.validateCourier(courierId.trim())
      : await this.findNearestCourier(order.restaurantId);

    await this.reserveCourier(
      selectedCourierId,
      order.id,
      authorization,
    );

    try {
      const updated = await this.dataSource.transaction(async (manager) => {
        const previousStatus = order.status;
        const assignedAt = new Date();

        order.courierId = selectedCourierId;
        order.courierAssignedAt = assignedAt;
        order.status = OrderStatus.OUT_FOR_DELIVERY;

        const saved = await manager.save(order);

        await this.eventPublisher.publish(
          EVENT_TYPES.ORDER_STATUS_CHANGED,
          {
            orderId: saved.id,
            restaurantId: saved.restaurantId,
            status: saved.status,
            previousStatus,
          },
          'restaurant',
          manager,
        );

        await this.eventPublisher.publish(
          EVENT_TYPES.ORDER_COURIER_ASSIGNED,
          {
            orderId: saved.id,
            restaurantId: saved.restaurantId,
            courierId: selectedCourierId,
            status: saved.status,
            assignedAt: assignedAt.toISOString(),
          },
          'restaurant',
          manager,
        );

        return saved;
      });

      return updated;
    } catch (error) {
      try {
        await this.releaseCourier(
          selectedCourierId,
          order.id,
          authorization,
        );
      } catch (releaseError) {
        const message =
          releaseError instanceof Error
            ? releaseError.message
            : String(releaseError);
        this.logger.error(
          `Falha ao liberar entregador ${selectedCourierId} apos erro na atribuicao: ${message}`,
        );
      }

      throw error;
    }
  }

  async updateStatus(
    id: string,
    status: OrderStatus,
    authorization?: string,
  ) {
    if (!Object.values(OrderStatus).includes(status)) {
      throw new BadRequestException('status invalido');
    }

    const order = await this.findOne(id);

    if (order.status === status) {
      return order;
    }

    const allowed = ALLOWED_TRANSITIONS[order.status] ?? [];

    if (!allowed.includes(status)) {
      throw new BadRequestException(
        `Transicao de ${order.status} para ${status} nao permitida`,
      );
    }

    const previousStatus = order.status;
    order.status = status;

    await this.dataSource.transaction(async (manager) => {
      await manager.save(order);

      await this.eventPublisher.publish(
        EVENT_TYPES.ORDER_STATUS_CHANGED,
        {
          orderId: order.id,
          restaurantId: order.restaurantId,
          status: order.status,
          previousStatus,
        },
        'restaurant',
        manager,
      );
    });

    if (
      order.courierId &&
      (status === OrderStatus.DELIVERED ||
        status === OrderStatus.CANCELLED) &&
      previousStatus === OrderStatus.OUT_FOR_DELIVERY
    ) {
      try {
        await this.releaseCourier(order.courierId, order.id, authorization);
      } catch (error) {
        const message =
          error instanceof Error ? error.message : String(error);
        this.logger.error(
          `Pedido ${order.id} atualizado, mas falhou ao liberar o entregador ${order.courierId}: ${message}`,
        );
      }
    }

    return order;
  }

  async handlePaymentResult(orderId: string, approved: boolean) {
    const order = await this.dataSource
      .getRepository(Order)
      .findOne({ where: { id: orderId } });

    if (!order) {
      this.logger.warn(`Pedido ${orderId} nao encontrado para pagamento`);
      return null;
    }

    if (order.status !== OrderStatus.PENDING_PAYMENT) {
      return order;
    }

    return this.updateStatus(
      order.id,
      approved ? OrderStatus.CONFIRMED : OrderStatus.PAYMENT_REJECTED,
    );
  }

  private async assertCanAccessOrder(
    order: Order,
    user: AuthenticatedUser,
  ): Promise<void> {
    if (user.roles.includes(AUTH_ROLES.OWNER) && user.ownerId) {
      if (
        await this.restaurantAccess.isOwnedBy(
          order.restaurantId,
          user.ownerId,
        )
      ) {
        return;
      }
    }

    if (
      user.roles.includes(AUTH_ROLES.COSTUMER) &&
      order.costumerUserId === user.userId
    ) {
      return;
    }

    if (
      user.roles.includes(AUTH_ROLES.COURIER) &&
      order.courierId === user.courierId
    ) {
      return;
    }

    throw new ForbiddenException('Pedido de outro usuario');
  }

  private async reserveCourier(
    courierId: string,
    orderId: string,
    authorization?: string,
  ): Promise<void> {
    const token = this.assertInternalAuthorization(authorization);

    const response = await this.callCourierService(
      courierId,
      'reserve',
      orderId,
      token,
      'reservar entregador',
    );

    if (response.status === 409) {
      throw new ConflictException('Entregador indisponivel');
    }

    if (!response.ok) {
      throw new InternalServerErrorException(
        `Erro ao reservar entregador: ${response.status}`,
      );
    }
  }

  private async releaseCourier(
    courierId: string,
    orderId: string,
    authorization?: string,
  ): Promise<void> {
    if (!authorization) {
      this.logger.warn(
        `Sem token para liberar o entregador ${courierId} do pedido ${orderId}`,
      );
      return;
    }

    try {
      const response = await this.callCourierService(
        courierId,
        'release',
        orderId,
        authorization,
        'liberar entregador',
      );

      if (!response.ok) {
        this.logger.warn(
          `Falha ao liberar entregador ${courierId}: ${response.status}`,
        );
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      this.logger.warn(
        `Falha ao liberar entregador ${courierId}: ${message}`,
      );
    }
  }

  private assertInternalAuthorization(authorization?: string): string {
    if (!authorization) {
      throw new ServiceUnavailableException(
        'Token de servico ausente para reservar entregador',
      );
    }

    return authorization;
  }

  private async callCourierService(
    courierId: string,
    action: 'reserve' | 'release',
    orderId: string,
    authorization: string,
    operation: string,
  ): Promise<Response> {
    try {
      return await fetch(
        `${this.userServiceBaseUrl()}/courier/${encodeURIComponent(courierId)}/${action}`,
        {
          method: 'POST',
          headers: {
            'content-type': 'application/json',
            authorization,
          },
          body: JSON.stringify({ orderId }),
          signal: AbortSignal.timeout(5000),
        },
      );
    } catch {
      throw new ServiceUnavailableException(
        `Nao foi possivel ${operation}`,
      );
    }
  }

  private async findNearestCourier(restaurantId: string): Promise<string> {
    const address = await this.dataSource
      .getRepository(RestaurantAddress)
      .findOne({ where: { restaurant: { id: restaurantId } } });

    if (!address) {
      throw new BadRequestException(
        'Restaurante sem endereco para buscar entregadores',
      );
    }

    const url = new URL('/courier/nearby', this.userServiceBaseUrl());
    url.searchParams.set('latitude', String(address.latitude));
    url.searchParams.set('longitude', String(address.longitude));
    url.searchParams.set(
      'radiusKm',
      process.env.COURIER_SEARCH_RADIUS_KM ?? '10',
    );
    url.searchParams.set('limit', '5');

    let response: Response;

    try {
      response = await fetch(url, { signal: AbortSignal.timeout(5000) });
    } catch {
      throw new ServiceUnavailableException(
        'Nao foi possivel buscar entregadores',
      );
    }

    if (!response.ok) {
      throw new InternalServerErrorException(
        `Erro ao buscar entregadores: ${response.status}`,
      );
    }

    const couriers = (await response.json()) as NearbyCourier[];

    if (!Array.isArray(couriers) || couriers.length === 0) {
      throw new NotFoundException('Nenhum entregador disponivel');
    }

    return couriers[0].courierId;
  }

  private async validateCourier(courierId: string): Promise<string> {
    let response: Response;

    try {
      response = await fetch(
        `${this.userServiceBaseUrl()}/courier/${encodeURIComponent(courierId)}`,
        { signal: AbortSignal.timeout(5000) },
      );
    } catch {
      throw new ServiceUnavailableException(
        'Nao foi possivel consultar o entregador',
      );
    }

    if (response.status === 404) {
      throw new NotFoundException('Entregador nao encontrado');
    }

    if (!response.ok) {
      throw new InternalServerErrorException(
        `Erro ao consultar entregador: ${response.status}`,
      );
    }

    const courier = (await response.json()) as CourierDetails;

    if (!courier.courierId) {
      throw new InternalServerErrorException(
        'Resposta invalida do servico de entregadores',
      );
    }

    if (courier.available !== 'available') {
      throw new BadRequestException('Entregador indisponivel');
    }

    return courier.courierId;
  }

  private userServiceBaseUrl(): string {
    return (process.env.USER_SERVICE_URL ?? 'http://floci:8080').replace(
      /\/$/,
      '',
    );
  }

  private validateCreateOrder(dto: CreateOrderDto): void {
    if (!dto.restaurantId) {
      throw new BadRequestException('restaurantId e obrigatorio');
    }

    if (!dto.paymentMethod) {
      throw new BadRequestException('paymentMethod e obrigatorio');
    }

    if (!Array.isArray(dto.items) || dto.items.length === 0) {
      throw new BadRequestException('O pedido precisa ter ao menos um item');
    }

    const productIds = new Set<string>();

    for (const item of dto.items) {
      if (!item.productId || productIds.has(item.productId)) {
        throw new BadRequestException('productId invalido ou duplicado');
      }

      const quantity = Number(item.quantity);

      if (!Number.isInteger(quantity) || quantity < 1) {
        throw new BadRequestException('quantity invalida');
      }

      productIds.add(item.productId);
    }
  }

  private round(value: number): number {
    return Math.round(value * 100) / 100;
  }
}
