import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { GeolocationModule } from '@restaurant/geolocation';
import { RestaurantAddressService } from './restaurant-address.service';
import { RestaurantAddressController } from './restaurant-address.controller';
import { RestaurantAddress } from './entities/restaurant-address.entity';

@Module({
  imports: [TypeOrmModule.forFeature([RestaurantAddress]), GeolocationModule],
  controllers: [RestaurantAddressController],
  providers: [RestaurantAddressService],
})
export class RestaurantAddressModule {}
