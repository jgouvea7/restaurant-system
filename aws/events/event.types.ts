export const EVENT_TYPES = {
  RESTAURANT_CREATED: 'restaurant.created',
  RESTAURANT_DELETED: 'restaurant.deleted',
  COURIER_LOCATION_UPDATED: 'courier.location.updated',
  COURIER_AVAILABILITY_CHANGED: 'courier.availability.changed',
  ORDER_CREATED: 'order.created',
  ORDER_STATUS_CHANGED: 'order.status.changed',
  PAYMENT_APPROVED: 'payment.approved',
  PAYMENT_REJECTED: 'payment.rejected',
} as const;

export type EventType = (typeof EVENT_TYPES)[keyof typeof EVENT_TYPES];

export interface RestaurantCreatedEvent {
  restaurantId: string;
  name: string;
  slug: string;
  ownerUserId: string;
  latitude: number | null;
  longitude: number | null;
}

export interface RestaurantDeletedEvent {
  restaurantId: string;
  name: string | null;
}

export interface CourierLocationUpdatedEvent {
  courierId: string;
  latitude: number;
  longitude: number;
  available: boolean;
}

export interface CourierAvailabilityChangedEvent {
  courierId: string;
  available: boolean;
}

export interface OrderItemEvent {
  productId: string;
  productName: string;
  unitPrice: number;
  quantity: number;
  subtotal: number;
}

export interface OrderCreatedEvent {
  orderId: string;
  restaurantId: string;
  costumerUserId: string;
  total: number;
  paymentMethod: string;
  deliveryAddress: string | null;
  items: OrderItemEvent[];
}

export interface OrderStatusChangedEvent {
  orderId: string;
  restaurantId: string;
  status: string;
  previousStatus: string;
}

export interface PaymentApprovedEvent {
  paymentId: string;
  orderId: string;
  amount: number;
}

export interface PaymentRejectedEvent {
  paymentId: string;
  orderId: string;
  amount: number;
  reason: string;
}

export interface EventPayloads {
  [EVENT_TYPES.RESTAURANT_CREATED]: RestaurantCreatedEvent;
  [EVENT_TYPES.RESTAURANT_DELETED]: RestaurantDeletedEvent;
  [EVENT_TYPES.COURIER_LOCATION_UPDATED]: CourierLocationUpdatedEvent;
  [EVENT_TYPES.COURIER_AVAILABILITY_CHANGED]: CourierAvailabilityChangedEvent;
  [EVENT_TYPES.ORDER_CREATED]: OrderCreatedEvent;
  [EVENT_TYPES.ORDER_STATUS_CHANGED]: OrderStatusChangedEvent;
  [EVENT_TYPES.PAYMENT_APPROVED]: PaymentApprovedEvent;
  [EVENT_TYPES.PAYMENT_REJECTED]: PaymentRejectedEvent;
}

export interface DomainEvent<T extends EventType = EventType> {
  id: string;
  type: T;
  source: string;
  occurredAt: string;
  data: EventPayloads[T];
}
