export const EVENT_TYPES = {
  RESTAURANT_CREATED: 'restaurant.created',
  RESTAURANT_DELETED: 'restaurant.deleted',
  COURIER_LOCATION_UPDATED: 'courier.location.updated',
  COURIER_AVAILABILITY_CHANGED: 'courier.availability.changed',
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

export interface EventPayloads {
  [EVENT_TYPES.RESTAURANT_CREATED]: RestaurantCreatedEvent;
  [EVENT_TYPES.RESTAURANT_DELETED]: RestaurantDeletedEvent;
  [EVENT_TYPES.COURIER_LOCATION_UPDATED]: CourierLocationUpdatedEvent;
  [EVENT_TYPES.COURIER_AVAILABILITY_CHANGED]: CourierAvailabilityChangedEvent;
}

export interface DomainEvent<T extends EventType = EventType> {
  id: string;
  type: T;
  source: string;
  occurredAt: string;
  data: EventPayloads[T];
}
