import { OutboxRelayService } from '@restaurant/aws';
import type {
  EventOutboxStore,
  StoredEvent,
} from '@restaurant/aws';
import type { EventPublisherService } from '@restaurant/aws';

describe('OutboxRelayService', () => {
  let store: {
    claimPending: jest.Mock;
    markPublished: jest.Mock;
    markFailed: jest.Mock;
  };
  let publisher: { deliver: jest.Mock };
  let relay: OutboxRelayService;

  const event: StoredEvent = {
    id: 'event-1',
    type: 'order.created',
    source: 'restaurant',
    occurredAt: new Date().toISOString(),
    data: { orderId: 'order-1' } as never,
    attempts: 0,
  };

  beforeEach(() => {
    store = {
      claimPending: jest.fn().mockResolvedValue([event]),
      markPublished: jest.fn().mockResolvedValue(undefined),
      markFailed: jest.fn().mockResolvedValue(undefined),
    };
    publisher = { deliver: jest.fn().mockResolvedValue(undefined) };

    relay = new OutboxRelayService(
      publisher as unknown as EventPublisherService,
      store as unknown as EventOutboxStore,
    );
  });

  it('publishes claimed events and marks them as published', async () => {
    const published = await relay.flush();

    expect(published).toBe(1);
    expect(publisher.deliver).toHaveBeenCalledWith(event);
    expect(store.markPublished).toHaveBeenCalledWith('event-1');
  });

  it('marks failed events for retry', async () => {
    publisher.deliver.mockRejectedValue(new Error('sns unavailable'));

    const published = await relay.flush();

    expect(published).toBe(0);
    expect(store.markFailed).toHaveBeenCalledWith(
      'event-1',
      0,
      'sns unavailable',
    );
    expect(store.markPublished).not.toHaveBeenCalled();
  });
});
