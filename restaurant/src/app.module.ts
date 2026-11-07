import { Module } from '@nestjs/common';
import {
  isProduction,
  ObservabilityModule,
  requiredEnv,
} from '@restaurant/geolocation';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { TypeOrmModule } from '@nestjs/typeorm';
import { RestaurantsModule } from './restaurants/restaurants.module';
import { RestaurantAddressModule } from './restaurant-address/restaurant-address.module';
import { ProductsModule } from './products/products.module';
import { OpeningHourModule } from './opening-hour/opening-hour.module';
import { OrdersModule } from './orders/orders.module';
import { GeolocationModule } from '@restaurant/geolocation';
import { HealthModule } from './health/health.module';
import { OutboxModule } from './outbox/outbox.module';

@Module({
  imports: [
    TypeOrmModule.forRoot({
      type: 'postgres',
      host: process.env.DB_HOST ?? 'localhost',
      port: Number(process.env.DB_PORT ?? 17002),
      username: requiredEnv('DB_USER', 'restaurant'),
      password: requiredEnv('DB_PASSWORD', 'restaurant1234'),
      database: requiredEnv('DB_NAME', 'restaurants'),
      autoLoadEntities: true,
      synchronize: !isProduction() && process.env.DB_SYNCHRONIZE === 'true',
      migrations: [__dirname + '/migrations/*{.ts,.js}'],
      migrationsRun: process.env.DB_MIGRATIONS_RUN !== 'false',
      retryAttempts: 30,
      retryDelay: 2000,
    }),
    RestaurantsModule,
    RestaurantAddressModule,
    ProductsModule,
    OpeningHourModule,
    OrdersModule,
    GeolocationModule,
    OutboxModule,
    HealthModule,
    ObservabilityModule,
  ],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}
