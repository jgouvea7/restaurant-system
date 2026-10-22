import { Controller, Get, Post, Body, Patch, Param, Delete } from '@nestjs/common';
import { CostumerService } from './costumer.service';
import { CreateCostumerDto } from './dto/create-costumer.dto';
import { UpdateCostumerDto } from './dto/update-costumer.dto';

@Controller('costumer')
export class CostumerController {
  constructor(private readonly costumerService: CostumerService) {}

  @Post()
  async createUser(@Body() createCostumerDto: CreateCostumerDto) {
    const user = this.costumerService.createUserCostumer(createCostumerDto)
    return user;
  }

  @Get()
  getUsers() {
    return this.costumerService.getAllUsers();
  }

  
}
