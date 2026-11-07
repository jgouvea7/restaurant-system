import { Body, Controller, Get, Post, Query, UseGuards } from '@nestjs/common';
import {
  AUTH_ROLES,
  JwtAuthGuard,
  Roles,
  RolesGuard,
} from '@restaurant/geolocation';
import { CostumerService } from './costumer.service';
import { CreateCostumerDto } from './dto/create-costumer.dto';

@Controller('costumer')
export class CostumerController {
  constructor(private readonly costumerService: CostumerService) {}

  @Post()
  async createUserCostumer(@Body() createCostumerDto: CreateCostumerDto) {
    return this.costumerService.createUserCostumer(createCostumerDto);
  }

  @Get()
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(AUTH_ROLES.OWNER)
  getUsers(@Query('limit') limit?: string, @Query('cursor') cursor?: string) {
    return this.costumerService.getAllCostumerUsers(limit, cursor);
  }
}
