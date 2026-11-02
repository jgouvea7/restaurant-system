import {
  Body,
  Controller,
  Get,
  Param,
  Patch,
  Post,
  Query,
} from '@nestjs/common';
import { CourierService } from './courier.service';
import { CreateCourierDto } from './dto/create-courier.dto';
import { UpdateCourierAvailabilityDto } from './dto/update-courier-availability.dto';
import { UpdateCourierLocationDto } from './dto/update-courier-location.dto';

@Controller('courier')
export class CourierController {
  constructor(private readonly courierService: CourierService) {}

  @Post()
  createUserCourier(@Body() createCourierDto: CreateCourierDto) {
    return this.courierService.createUserCourier(createCourierDto);
  }

  @Post(':id/available')
  updateCourierAvailable(@Param('id') courierId: string) {
    return this.courierService.updateCourierStatus(courierId);
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

  @Patch(':id/location')
  updateLocation(
    @Param('id') courierId: string,
    @Body() updateCourierLocationDto: UpdateCourierLocationDto,
  ) {
    return this.courierService.updateLocation(
      courierId,
      Number(updateCourierLocationDto.latitude),
      Number(updateCourierLocationDto.longitude),
    );
  }

  @Patch(':id/availability')
  updateAvailability(
    @Param('id') courierId: string,
    @Body() updateCourierAvailabilityDto: UpdateCourierAvailabilityDto,
  ) {
    return this.courierService.setCourierAvailability(
      courierId,
      updateCourierAvailabilityDto.available,
    );
  }

  @Get()
  findAll() {
    return this.courierService.getAllCourierUsers();
  }
}
