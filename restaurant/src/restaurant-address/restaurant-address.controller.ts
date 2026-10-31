import { Controller, Get, Post, Body, Patch, Param, Delete } from '@nestjs/common';
import { RestaurantAddressService } from './restaurant-address.service';
import { CreateRestaurantAddressDto } from './dto/create-restaurant-address.dto';
import { UpdateRestaurantAddressDto } from './dto/update-restaurant-address.dto';

@Controller('restaurant-address')
export class RestaurantAddressController {
  constructor(private readonly restaurantAddressService: RestaurantAddressService) {}


}
