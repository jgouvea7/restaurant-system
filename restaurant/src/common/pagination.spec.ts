import {
  buildPage,
  decodeCursor,
  encodeCursor,
  resolvePageLimit,
} from '@restaurant/geolocation';

describe('cursor pagination', () => {
  it('round-trips a cursor', () => {
    const cursor = encodeCursor(
      new Date('2026-11-06T12:00:00.000Z'),
      '11111111-1111-4111-8111-111111111111',
    );

    expect(decodeCursor(cursor)).toEqual({
      createdAt: new Date('2026-11-06T12:00:00.000Z'),
      id: '11111111-1111-4111-8111-111111111111',
    });
  });

  it('rejects malformed cursors', () => {
    expect(decodeCursor('not-a-cursor')).toBeNull();
    expect(decodeCursor('')).toBeNull();
  });

  it('clamps the page size', () => {
    expect(resolvePageLimit(undefined)).toBe(20);
    expect(resolvePageLimit('0')).toBe(20);
    expect(resolvePageLimit('500')).toBe(100);
    expect(resolvePageLimit('10')).toBe(10);
  });

  it('returns a next cursor only when there are extra rows', () => {
    const first = { createdAt: new Date('2026-11-06T12:00:00.000Z') };
    const second = { createdAt: new Date('2026-11-06T11:00:00.000Z') };

    const page = buildPage([first, second], 1, (row) => ({
      createdAt: row.createdAt,
      id: '11111111-1111-4111-8111-111111111111',
    }));

    expect(page.items).toEqual([first]);
    expect(page.nextCursor).not.toBeNull();
  });
});
