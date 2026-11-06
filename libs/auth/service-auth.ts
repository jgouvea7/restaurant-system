import {
  CanActivate,
  ExecutionContext,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { createHmac, timingSafeEqual } from 'node:crypto';
import { currentRequestContext } from '../observability/request-context';

export const SERVICE_AUTH_HEADERS = {
  service: 'x-service-name',
  timestamp: 'x-service-timestamp',
  signature: 'x-service-signature',
} as const;

export const SERVICE_AUTH = {
  secretEnv: 'SERVICE_AUTH_SECRET',
  defaultSecret: 'restaurant-dev-service-secret-change-me',
  maxClockSkewMs: 60_000,
} as const;

interface ServiceAuthenticatedRequest {
  headers: Record<string, string | string[] | undefined>;
  serviceName?: string;
}

export function getServiceAuthSecret(): string {
  return process.env[SERVICE_AUTH.secretEnv] ?? SERVICE_AUTH.defaultSecret;
}

export function signServiceRequest(
  serviceName = process.env.SERVICE_NAME ?? 'unknown',
  timestamp = String(Date.now()),
): Record<string, string> {
  const signature = createHmac('sha256', getServiceAuthSecret())
    .update(`${serviceName}\n${timestamp}`)
    .digest('hex');

  return {
    [SERVICE_AUTH_HEADERS.service]: serviceName,
    [SERVICE_AUTH_HEADERS.timestamp]: timestamp,
    [SERVICE_AUTH_HEADERS.signature]: signature,
  };
}

export function verifyServiceSignature(
  serviceName: string | undefined,
  timestamp: string | undefined,
  signature: string | undefined,
  now = Date.now(),
): boolean {
  if (!serviceName || !timestamp || !signature) {
    return false;
  }

  const parsedTimestamp = Number(timestamp);

  if (
    !Number.isFinite(parsedTimestamp) ||
    Math.abs(now - parsedTimestamp) > SERVICE_AUTH.maxClockSkewMs
  ) {
    return false;
  }

  const expected = createHmac('sha256', getServiceAuthSecret())
    .update(`${serviceName}\n${timestamp}`)
    .digest('hex');

  const expectedBuffer = Buffer.from(expected);
  const providedBuffer = Buffer.from(signature);

  return (
    expectedBuffer.length === providedBuffer.length &&
    timingSafeEqual(expectedBuffer, providedBuffer)
  );
}

export function internalRequestHeaders(
  serviceName = process.env.SERVICE_NAME ?? 'unknown',
): Record<string, string> {
  const headers = signServiceRequest(serviceName);
  const context = currentRequestContext();

  if (context?.requestId) {
    headers['x-request-id'] = context.requestId;
  }

  if (context?.traceparent) {
    headers.traceparent = context.traceparent;
  }

  return headers;
}

@Injectable()
export class ServiceAuthGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const request = context
      .switchToHttp()
      .getRequest<ServiceAuthenticatedRequest>();
    const headers = request.headers;
    const serviceName = this.readHeader(headers[SERVICE_AUTH_HEADERS.service]);
    const timestamp = this.readHeader(headers[SERVICE_AUTH_HEADERS.timestamp]);
    const signature = this.readHeader(headers[SERVICE_AUTH_HEADERS.signature]);

    if (!verifyServiceSignature(serviceName, timestamp, signature)) {
      throw new UnauthorizedException(
        'Credenciais de servico invalidas ou expiradas',
      );
    }

    request.serviceName = serviceName;

    return true;
  }

  private readHeader(value: string | string[] | undefined): string | undefined {
    return Array.isArray(value) ? value[0] : value;
  }
}
