import { NestFactory } from '@nestjs/core';
import {
  RateLimitGuard,
  RequestContextMiddleware,
} from '@restaurant/geolocation';
import { AppModule } from './app.module';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  const requestContext = app.get(RequestContextMiddleware);
  app.use(requestContext.use.bind(requestContext));
  app.useGlobalGuards(app.get(RateLimitGuard));
  await app.listen(process.env.PORT ?? 3000);
}
void bootstrap();
