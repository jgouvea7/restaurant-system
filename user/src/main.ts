import { NestFactory } from '@nestjs/core';
import {
  RateLimitGuard,
  RequestContextMiddleware,
} from '@restaurant/geolocation';
import { AppModule } from './app.module';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  app.use(new RequestContextMiddleware());
  app.useGlobalGuards(new RateLimitGuard());
  await app.listen(process.env.PORT ?? 3000);
}
bootstrap();
