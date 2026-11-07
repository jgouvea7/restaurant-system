export interface CursorPage<T> {
  items: T[];
  nextCursor: string | null;
}

export interface CursorPosition {
  createdAt: Date;
  id: string;
}

export const DEFAULT_PAGE_SIZE = 20;
export const MAX_PAGE_SIZE = 100;

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function resolvePageLimit(
  value: string | number | null | undefined,
  defaultLimit = DEFAULT_PAGE_SIZE,
  maxLimit = MAX_PAGE_SIZE,
): number {
  if (value === null || value === undefined || value === '') {
    return defaultLimit;
  }

  const parsed = Number(value);

  if (!Number.isFinite(parsed) || parsed < 1) {
    return defaultLimit;
  }

  return Math.min(Math.trunc(parsed), maxLimit);
}

export function encodeCursor(createdAt: Date | string, id: string): string {
  const date = createdAt instanceof Date ? createdAt : new Date(createdAt);

  return Buffer.from(
    JSON.stringify({ createdAt: date.toISOString(), id }),
    'utf8',
  ).toString('base64url');
}

export function decodeCursor(
  cursor: string | null | undefined,
): CursorPosition | null {
  if (!cursor) {
    return null;
  }

  try {
    const parsed = JSON.parse(
      Buffer.from(cursor, 'base64url').toString('utf8'),
    ) as { createdAt?: unknown; id?: unknown };

    if (
      typeof parsed.createdAt !== 'string' ||
      typeof parsed.id !== 'string' ||
      !UUID_PATTERN.test(parsed.id)
    ) {
      return null;
    }

    const createdAt = new Date(parsed.createdAt);

    if (Number.isNaN(createdAt.getTime())) {
      return null;
    }

    return { createdAt, id: parsed.id.toLowerCase() };
  } catch {
    return null;
  }
}

export function buildPage<T>(
  rows: T[],
  limit: number,
  cursorOf: (row: T) => CursorPosition,
): CursorPage<T> {
  const hasMore = rows.length > limit;
  const items = hasMore ? rows.slice(0, limit) : rows;
  const last = items[items.length - 1];

  if (!hasMore || !last) {
    return { items, nextCursor: null };
  }

  const position = cursorOf(last);

  return {
    items,
    nextCursor: encodeCursor(position.createdAt, position.id),
  };
}

export function emptyPage<T>(): CursorPage<T> {
  return { items: [], nextCursor: null };
}
