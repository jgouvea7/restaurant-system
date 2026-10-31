import { PartialType } from '@nestjs/mapped-types';
import { CreateRestaurantAddressDto } from './create-restaurant-address.dto';

export class UpdateRestaurantAddressDto extends PartialType(CreateRestaurantAddressDto) {}
