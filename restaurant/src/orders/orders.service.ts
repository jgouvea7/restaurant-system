import {
  BadRequestException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { DataSource, FindOptionsWhere, In } from 'typeorm';
import {
  EVENT_TYPES,
  EventPublisherService,
} from '@restaurant/aws';
import { CreateOrderDto } from './dto/create-order.dto';
import { OrderItem } from './entities/order-item.entity';
import { Order, OrderStatus } from './entities/order.entity';
import { Product } from '../products/entities/product.entity';
import { Restaurant } from '../restaurants/entities/restaurant.entity';

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

  findAll(restaurantId?: string, costumerUserId?: string) {
    const where: FindOptionsWhere<Order> = {};

    if (restaurantId) {
      where.restaurantId = restaurantId;
    }

    if (costumerUserId) {
      where.costumerUserId = costumerUserId;
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
