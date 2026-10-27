import { Controller, Get, Post, Body, Patch, Param, Delete } from '@nestjs/common';
import { CourierService } from './courier.service';
import { CreateCourierDto } from './dto/create-courier.dto';
import { UpdateCourierDto } from './dto/update-courier.dto';

@Controller('courier')
export class CourierController {
  constructor(private readonly courierService: CourierService) {}

  @Post()
  createUserCourier(@Body() createCourierDto: CreateCourierDto) {
    return this.courierService.createUserCourier(createCourierDto);
  }

  @Post(":id/available")
  updateCourierAvailable(@Param('id') courierId: string){
    return this.courierService.updateCourierStatus(courierId);
  }

  @Get()
  findAll() {
    return this.courierService.getAllCourierUsers();
  }
}
