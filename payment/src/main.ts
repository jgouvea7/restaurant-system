import { ValidationPipe } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import {
  assertAuthConfiguration,
  IdempotencyInterceptor,
  RateLimitGuard,
  RequestContextMiddleware,
} from '@restaurant/geolocation';
import helmet from 'helmet';
import { AppModule } from './app.module';

interface ExpressLike {
  set(name: string, value: number | string): void;
}

interface HttpAdapterLike {
  getInstance(): ExpressLike;
}

async function bootstrap() {
  assertAuthConfiguration();

  const app = await NestFactory.create(AppModule);
  const requestContext = app.get(RequestContextMiddleware);
  app.use(requestContext.use.bind(requestContext));
  const httpAdapter = app.getHttpAdapter() as unknown as HttpAdapterLike;
  const express = httpAdapter.getInstance();
  const trustProxy = process.env.TRUST_PROXY;

  if (trustProxy && trustProxy !== 'false') {
    const numericTrust = Number(trustProxy);
    express.set(
      'trust proxy',
      Number.isFinite(numericTrust) ? numericTrust : trustProxy,
    );
  }

  app.use(helmet());
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
      transformOptions: { enableImplicitConversion: false },
      validationError: { target: false, value: false },
    }),
  );
  app.useGlobalGuards(app.get(RateLimitGuard));
  app.useGlobalInterceptors(new IdempotencyInterceptor());
  await app.listen(process.env.PORT ?? 3000);
}

void bootstrap();
