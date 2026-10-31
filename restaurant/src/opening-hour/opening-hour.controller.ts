import { Controller, Get, Post, Body, Patch, Param, Delete } from '@nestjs/common';
import { OpeningHourService } from './opening-hour.service';
import { CreateOpeningHourDto } from './dto/create-opening-hour.dto';
import { UpdateOpeningHourDto } from './dto/update-opening-hour.dto';

@Controller('opening-hour')
export class OpeningHourController {
  constructor(private readonly openingHourService: OpeningHourService) {}

  @Post()
  create(@Body() createOpeningHourDto: CreateOpeningHourDto) {
    return this.openingHourService.create(createOpeningHourDto);
  }

  @Get()
  findAll() {
    return this.openingHourService.findAll();
  }

  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.openingHourService.findOne(+id);
  }

  @Patch(':id')
  update(@Param('id') id: string, @Body() updateOpeningHourDto: UpdateOpeningHourDto) {
    return this.openingHourService.update(+id, updateOpeningHourDto);
  }

  @Delete(':id')
  remove(@Param('id') id: string) {
    return this.openingHourService.remove(+id);
  }
}
