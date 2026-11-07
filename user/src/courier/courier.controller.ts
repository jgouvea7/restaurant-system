import {
  Body,
  Controller,
  Get,
  Param,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import {
  AUTH_ROLES,
  CurrentUser,
  JwtAuthGuard,
  Roles,
  RolesGuard,
  ServiceAuthGuard,
} from '@restaurant/geolocation';
import type { AuthenticatedUser } from '@restaurant/geolocation';
import { CourierService } from './courier.service';
import { CreateCourierDto } from './dto/create-courier.dto';
import { UpdateCourierAvailabilityDto } from './dto/update-courier-availability.dto';
import { UpdateCourierLocationDto } from './dto/update-courier-location.dto';
import { ReserveCourierDto } from './dto/reserve-courier.dto';

@Controller('courier')
export class CourierController {
  constructor(private readonly courierService: CourierService) {}

  @Post()
  createUserCourier(@Body() createCourierDto: CreateCourierDto) {
    return this.courierService.createUserCourier(createCourierDto);
  }

  @Post(':id/available')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(AUTH_ROLES.COURIER)
  updateCourierAvailable(
    @Param('id') courierId: string,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.courierService.updateCourierStatus(courierId, user.courierId);
  }

  @Post(':id/reserve')
  @UseGuards(ServiceAuthGuard)
  reserve(
    @Param('id') courierId: string,
    @Body() reserveCourierDto: ReserveCourierDto,
  ) {
    return this.courierService.reserveCourier(
      courierId,
      reserveCourierDto.orderId,
    );
  }

  @Post(':id/release')
  @UseGuards(ServiceAuthGuard)
  release(
    @Param('id') courierId: string,
    @Body() reserveCourierDto: ReserveCourierDto,
  ) {
    return this.courierService.releaseCourier(
      courierId,
      reserveCourierDto.orderId,
    );
  }

  @Post(':id/accept')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(AUTH_ROLES.COURIER)
  accept(
    @Param('id') courierId: string,
    @Body() reserveCourierDto: ReserveCourierDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.courierService.acceptAssignment(
      courierId,
      user.courierId,
      reserveCourierDto.orderId,
    );
  }

  @Post(':id/reject')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(AUTH_ROLES.COURIER)
  reject(
    @Param('id') courierId: string,
    @Body() reserveCourierDto: ReserveCourierDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.courierService.rejectAssignment(
      courierId,
      user.courierId,
      reserveCourierDto.orderId,
      reserveCourierDto.reason,
    );
  }

  @Get('nearby')
  findNearby(
    @Query('latitude') latitude: string,
    @Query('longitude') longitude: string,
    @Query('radiusKm') radiusKm?: string,
    @Query('limit') limit?: string,
  ) {
    return this.courierService.findNearbyAvailable({
      latitude: Number(latitude),
      longitude: Number(longitude),
      radiusKm: radiusKm === undefined ? undefined : Number(radiusKm),
      limit: limit === undefined ? undefined : Number(limit),
    });
  }

  @Get(':id/location')
  getLocation(@Param('id') courierId: string) {
    return this.courierService.getCourierLocation(courierId);
  }

  @Get(':id')
  findOne(@Param('id') courierId: string) {
    return this.courierService.findCourierById(courierId);
  }

  @Patch(':id/location')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(AUTH_ROLES.COURIER)
  updateLocation(
    @Param('id') courierId: string,
    @Body() updateCourierLocationDto: UpdateCourierLocationDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.courierService.updateLocation(
      courierId,
      user.courierId,
      updateCourierLocationDto.latitude,
      updateCourierLocationDto.longitude,
    );
  }

  @Patch(':id/availability')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(AUTH_ROLES.COURIER)
  updateAvailability(
    @Param('id') courierId: string,
    @Body() updateCourierAvailabilityDto: UpdateCourierAvailabilityDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.courierService.setCourierAvailability(
      courierId,
      user.courierId,
      updateCourierAvailabilityDto.available,
    );
  }

  @Get()
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(AUTH_ROLES.OWNER)
  findAll(@Query('limit') limit?: string, @Query('cursor') cursor?: string) {
    return this.courierService.getAllCourierUsers(limit, cursor);
  }
}
