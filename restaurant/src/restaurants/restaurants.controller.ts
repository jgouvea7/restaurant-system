import {
  Controller,
  ForbiddenException,
  Get,
  Post,
  Body,
  Patch,
  Param,
  Delete,
  Query,
  UseGuards,
} from '@nestjs/common';
import {
  AUTH_ROLES,
  CurrentUser,
  JwtAuthGuard,
  Roles,
  RolesGuard,
} from '@restaurant/geolocation';
import type { AuthenticatedUser } from '@restaurant/geolocation';
import { RestaurantsService } from './restaurants.service';
import { CreateRestaurantDto } from './dto/create-restaurant.dto';
import { UpdateRestaurantDto } from './dto/update-restaurant.dto';

@Controller('restaurants')
export class RestaurantsController {
  constructor(private readonly restaurantsService: RestaurantsService) {}

  @Post()
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(AUTH_ROLES.OWNER)
  create(
    @Body() createRestaurantDto: CreateRestaurantDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    if (!user.ownerId || createRestaurantDto.ownerUserId !== user.ownerId) {
      throw new ForbiddenException(
        'Restaurante deve ser criado pelo proprio owner',
      );
    }

    return this.restaurantsService.create(createRestaurantDto);
  }

  @Get()
  findAll() {
    return this.restaurantsService.findAll();
  }

  @Get('nearby')
  findNearby(
    @Query('latitude') latitude: string,
    @Query('longitude') longitude: string,
    @Query('radiusKm') radiusKm?: string,
    @Query('limit') limit?: string,
  ) {
    return this.restaurantsService.findNearby({
      latitude: Number(latitude),
      longitude: Number(longitude),
      radiusKm: radiusKm === undefined ? undefined : Number(radiusKm),
      limit: limit === undefined ? undefined : Number(limit),
    });
  }

  @Get(':id/owner')
  findOwner(@Param("id") ownerId: string) {
    return this.restaurantsService.findOwnerById(ownerId)
  }

  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.restaurantsService.findOne(id);
  }

  @Patch(':id')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(AUTH_ROLES.OWNER)
  async update(
    @Param('id') id: string,
    @Body() updateRestaurantDto: UpdateRestaurantDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    await this.assertOwner(id, user);
    return this.restaurantsService.update(id, updateRestaurantDto);
  }

  @Delete(':id')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(AUTH_ROLES.OWNER)
  async remove(
    @Param('id') id: string,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    await this.assertOwner(id, user);
    return this.restaurantsService.remove(id);
  }

  private assertOwner(id: string, user: AuthenticatedUser) {
    if (!user.ownerId) {
      throw new ForbiddenException('Owner sem vinculo');
    }

    return this.restaurantsService.ensureOwned(id, user.ownerId);
  }
}
