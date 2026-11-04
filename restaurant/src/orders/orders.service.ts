import {
  BadRequestException,
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
  ) {}

  async create(dto: CreateOrderDto) {
    this.validateCreateOrder(dto);

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
        costumerUserId: dto.costumerUserId,
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

      return manager.save(entity);
    });

    await this.eventPublisher.publish(
      EVENT_TYPES.ORDER_CREATED,
      {
        orderId: order.id,
        restaurantId: order.restaurantId,
        costumerUserId: order.costumerUserId,
        total,
        paymentMethod: order.paymentMethod,
        deliveryAddress: order.deliveryAddress,
        items: items.map((item) => ({
          productId: item.product.id,
          productName: item.product.name,
          unitPrice: item.unitPrice,
          quantity: item.quantity,
          subtotal: item.subtotal,
        })),
      },
      'restaurant',
    );

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
        await this.assertOwnedRestaurant(restaurantId, user.ownerId);
        return this.findAll(restaurantId, costumerUserId);
      }

      const restaurants = await this.dataSource.getRepository(Restaurant).find({
        where: { ownerUserId: user.ownerId },
        select: { id: true },
      });
      const restaurantIds = restaurants.map((restaurant) => restaurant.id);

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
  ) {
    const order = await this.findOne(id);

    if (user.roles.includes(AUTH_ROLES.OWNER)) {
      if (!user.ownerId) {
        throw new ForbiddenException('Owner sem vinculo');
      }

      await this.assertOwnedRestaurant(order.restaurantId, user.ownerId);

      if (status === OrderStatus.OUT_FOR_DELIVERY && !order.courierId) {
        throw new BadRequestException(
          'Use a atribuicao de entregador para iniciar a entrega',
        );
      }

      return this.updateStatus(id, status);
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

      return this.updateStatus(id, status);
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

      return this.updateStatus(id, status);
    }

    throw new ForbiddenException('Permissao insuficiente');
  }

  async assignCourier(
    id: string,
    ownerId: string,
    courierId?: string,
  ) {
    const order = await this.findOne(id);
    await this.assertOwnedRestaurant(order.restaurantId, ownerId);

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

    order.courierId = selectedCourierId;
    order.courierAssignedAt = new Date();
    await this.dataSource.getRepository(Order).save(order);

    const updated = await this.updateStatus(
      order.id,
      OrderStatus.OUT_FOR_DELIVERY,
    );

    await this.eventPublisher.publish(
      EVENT_TYPES.ORDER_COURIER_ASSIGNED,
      {
        orderId: updated.id,
        restaurantId: updated.restaurantId,
        courierId: selectedCourierId,
        status: updated.status,
        assignedAt: order.courierAssignedAt.toISOString(),
      },
      'restaurant',
    );

    return updated;
  }

  async updateStatus(id: string, status: OrderStatus) {
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
    await this.dataSource.getRepository(Order).save(order);

    await this.eventPublisher.publish(
      EVENT_TYPES.ORDER_STATUS_CHANGED,
      {
        orderId: order.id,
        restaurantId: order.restaurantId,
        status: order.status,
        previousStatus,
      },
      'restaurant',
    );

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
      const restaurant = await this.dataSource
        .getRepository(Restaurant)
        .findOne({ where: { id: order.restaurantId } });

      if (restaurant?.ownerUserId === user.ownerId) {
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

  private async assertOwnedRestaurant(
    restaurantId: string,
    ownerId: string,
  ): Promise<Restaurant> {
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
    if (!dto.restaurantId || !dto.costumerUserId) {
      throw new BadRequestException(
        'restaurantId e costumerUserId sao obrigatorios',
      );
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
