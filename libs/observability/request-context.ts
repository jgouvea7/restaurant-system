import { AsyncLocalStorage } from 'node:async_hooks';

export interface RequestContext {
  requestId: string;
  traceparent?: string;
}

export const requestContextStorage = new AsyncLocalStorage<RequestContext>();

export function currentRequestContext(): RequestContext | undefined {
  return requestContextStorage.getStore();
}

export function currentRequestId(): string | undefined {
  return currentRequestContext()?.requestId;
}
