import { PartialType } from '../../common/partial-type';
import { CreateRestaurantAddressDto } from './create-restaurant-address.dto';

export class UpdateRestaurantAddressDto extends PartialType(CreateRestaurantAddressDto) {}
