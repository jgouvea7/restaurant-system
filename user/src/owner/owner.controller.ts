import { Controller, Get, Post, Body, Patch, Param, Delete } from '@nestjs/common';
import { OwnerService } from './owner.service';
import { CreateOwnerDto } from './dto/create-owner.dto';
import { UpdateOwnerDto } from './dto/update-owner.dto';

@Controller('owner')
export class OwnerController {
  constructor(private readonly ownerService: OwnerService) {}

  @Post()
  create(@Body() createOwnerDto: CreateOwnerDto) {
    return this.ownerService.createUserOwner(createOwnerDto);
  }

  @Get()
  findAll() {
    return this.ownerService.findAll();
  }

  @Get(":id")
  findOwner(@Param("id") ownerId: string) {
    return this.ownerService.findOwnerById(ownerId)
  }

}
