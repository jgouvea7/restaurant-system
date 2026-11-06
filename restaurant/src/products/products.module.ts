import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ProductsService } from './products.service';
import { ProductsController } from './products.controller';
import { Product } from './entities/product.entity';
import { RestaurantAccessModule } from '../restaurants/restaurant-access.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([Product]),
    RestaurantAccessModule,
  ],
  controllers: [ProductsController],
  providers: [ProductsService],
})
export class ProductsModule {}
