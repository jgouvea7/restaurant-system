export const EVENT_TYPES = {
  RESTAURANT_CREATED: 'restaurant.created',
  RESTAURANT_DELETED: 'restaurant.deleted',
  COURIER_LOCATION_UPDATED: 'courier.location.updated',
  COURIER_AVAILABILITY_CHANGED: 'courier.availability.changed',
  ORDER_CREATED: 'order.created',
  ORDER_STATUS_CHANGED: 'order.status.changed',
  ORDER_COURIER_ASSIGNED: 'order.courier.assigned',
  COURIER_ASSIGNMENT_OFFERED: 'courier.assignment.offered',
  COURIER_ASSIGNMENT_ACCEPTED: 'courier.assignment.accepted',
  COURIER_ASSIGNMENT_REJECTED: 'courier.assignment.rejected',
  COURIER_ASSIGNMENT_EXPIRED: 'courier.assignment.expired',
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

export interface OrderCourierAssignedEvent {
  orderId: string;
  restaurantId: string;
  courierId: string;
  status: string;
  assignedAt: string;
}

export interface CourierAssignmentOfferedEvent {
  orderId: string;
  courierId: string;
  expiresAt: string;
}

export interface CourierAssignmentAcceptedEvent {
  orderId: string;
  courierId: string;
  acceptedAt: string;
}

export interface CourierAssignmentRejectedEvent {
  orderId: string;
  courierId: string;
  reason: string | null;
}

export interface CourierAssignmentExpiredEvent {
  orderId: string;
  courierId: string;
  expiredAt: string;
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
  [EVENT_TYPES.ORDER_COURIER_ASSIGNED]: OrderCourierAssignedEvent;
  [EVENT_TYPES.COURIER_ASSIGNMENT_OFFERED]: CourierAssignmentOfferedEvent;
  [EVENT_TYPES.COURIER_ASSIGNMENT_ACCEPTED]: CourierAssignmentAcceptedEvent;
  [EVENT_TYPES.COURIER_ASSIGNMENT_REJECTED]: CourierAssignmentRejectedEvent;
  [EVENT_TYPES.COURIER_ASSIGNMENT_EXPIRED]: CourierAssignmentExpiredEvent;
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

export interface StoredEvent<T extends EventType = EventType>
  extends DomainEvent<T> {
  attempts: number;
}

export interface EventOutboxStore {
  save(event: DomainEvent, manager?: unknown): Promise<void>;
  claimPending(limit: number): Promise<StoredEvent[]>;
  markPublished(id: string): Promise<void>;
  markFailed(id: string, attempts: number, error: string): Promise<void>;
}

export type IdempotencyClaim = 'acquired' | 'processed' | 'locked';

export interface EventIdempotencyStore {
  claim(consumer: string, eventId: string): Promise<IdempotencyClaim>;
  markProcessed(consumer: string, eventId: string): Promise<void>;
  release(consumer: string, eventId: string): Promise<void>;
}

export interface EventMaintenanceStore {
  purgePublishedBefore(publishedBefore: Date): Promise<number>;
  purgeProcessedBefore(processedBefore: Date): Promise<number>;
}

export const EVENT_OUTBOX_STORE = Symbol('EVENT_OUTBOX_STORE');
export const EVENT_IDEMPOTENCY_STORE = Symbol('EVENT_IDEMPOTENCY_STORE');
export const EVENT_MAINTENANCE_STORE = Symbol('EVENT_MAINTENANCE_STORE');
