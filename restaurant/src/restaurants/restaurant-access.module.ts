import { Module } from '@nestjs/common';
import { RestaurantAccessService } from './restaurant-access.service';

@Module({
  providers: [RestaurantAccessService],
  exports: [RestaurantAccessService],
})
export class RestaurantAccessModule {}
