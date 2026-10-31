type Constructor<T = object> = new (...args: any[]) => T;

export function PartialType<T extends object>(
  classRef: Constructor<T>,
): Constructor<Partial<T>> {
  return class extends classRef {};
}
