import { Module } from '@nestjs/common';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { TypeOrmModule } from '@nestjs/typeorm';
import { RestaurantsModule } from './restaurants/restaurants.module';
import { RestaurantAddressModule } from './restaurant-address/restaurant-address.module';
import { ProductsModule } from './products/products.module';
import { OpeningHourModule } from './opening-hour/opening-hour.module';
import { GeolocationModule } from '@restaurant/geolocation';

@Module({
  imports: [
    TypeOrmModule.forRoot({
      type: "postgres",
      host: process.env.DB_HOST ?? "localhost",
      port: Number(process.env.DB_PORT ?? 17002),
      username: process.env.DB_USER ?? "restaurant",
      password: process.env.DB_PASSWORD ?? "restaurant1234",
      database: process.env.DB_NAME ?? "restaurants",
      autoLoadEntities: true,
      synchronize: true,
      retryAttempts: 30,
      retryDelay: 2000
    }),
    RestaurantsModule,
    RestaurantAddressModule,
    ProductsModule,
    OpeningHourModule,
    GeolocationModule],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}
