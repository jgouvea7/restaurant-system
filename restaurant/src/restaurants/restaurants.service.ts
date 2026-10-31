import { Injectable, InternalServerErrorException, NotFoundException } from '@nestjs/common';
import { CreateRestaurantDto } from './dto/create-restaurant.dto';
import { UpdateRestaurantDto } from './dto/update-restaurant.dto';
import { DataSource } from 'typeorm';
import { Restaurant } from './entities/restaurant.entity';
import { GeolocationService } from '@restaurant/geolocation';
import { RestaurantAddress } from '../restaurant-address/entities/restaurant-address.entity';

@Injectable()
export class RestaurantsService {
  constructor(
    private readonly dataSource: DataSource,
    private readonly geolocationService: GeolocationService
  ) {

  }
  async create(dto: CreateRestaurantDto) {

    return this.dataSource.transaction(async (manager) => {
      const ownerResponse = await fetch(`http://floci:8080/owner/${dto.ownerUserId}`, {
        method: "GET"
      })

      if (ownerResponse.status === 404) {
        throw new NotFoundException("Owner não encontrado");
      }

      if (!ownerResponse.ok) {
        throw new InternalServerErrorException(
          `Erro ao consultar owner: ${ownerResponse.status}`,
        );
      }

      const restaurant = await manager.create(Restaurant, {
        name: dto.name,
        slug: dto.slug,
        description: dto.description,
        phone: dto.phone,
        ownerUserId: dto.ownerUserId,
      })

      await manager.save(restaurant)

      const restaurantAddressData = await this.geolocationService.findAddressByCep(dto.restaurantAddress.postalCode);
      
      if(!restaurantAddressData) {
        throw new Error("CEP não encontrado")
      }

      const cordinates = await this.geolocationService.findCordByAddress({
        street: restaurantAddressData.logradouro,
        number: dto.restaurantAddress.number,
        city: restaurantAddressData.localidade,
        state: restaurantAddressData.uf,
      })

      const addressRestaurant = manager.create(RestaurantAddress, {
        street: restaurantAddressData.logradouro,
        number: dto.restaurantAddress.number,
        city: restaurantAddressData.localidade,
        state: restaurantAddressData.uf,
        postalCode: dto.restaurantAddress.postalCode,
        latitude: cordinates?.latitude,
        longitude: cordinates?.longitude,
        restaurant: restaurant
      })

      await manager.save(addressRestaurant)
      return { restaurant, addressRestaurant }
  })
  }

  findAll() {
    return this.dataSource.getRepository(Restaurant).find();
  }

  findOwnerById(ownerId: string) {
    return this.dataSource.getRepository(Restaurant).find({
      where: { ownerUserId: ownerId },
      select: {
        id: true,
        name: true,
      }
    })
  }

  findOne(restaurantId: string) {
    return this.dataSource.getRepository(Restaurant).find({
      where : { id: restaurantId }
    });
  }

  update(id: string, updateRestaurantDto: UpdateRestaurantDto) {
    return `This action updates a #${id} restaurant`;
  }

  remove(id: string) {
    return this.dataSource.getRepository(Restaurant).delete(id)
  }
}
