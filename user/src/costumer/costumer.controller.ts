import { Controller, Get, Post, Body, Patch, Param, Delete } from '@nestjs/common';
import { CostumerService } from './costumer.service';
import { CreateCostumerDto } from './dto/create-costumer.dto';
import { UpdateCostumerDto } from './dto/update-costumer.dto';

@Controller('costumer')
export class CostumerController {
  constructor(private readonly costumerService: CostumerService) {}

  @Post()
  async createUserCostumer(@Body() createCostumerDto: CreateCostumerDto) {
    return this.costumerService.createUserCostumer(createCostumerDto)
  }

  @Get()
  getUsers() {
    return this.costumerService.getAllCostumerUsers();
  }

  
}
