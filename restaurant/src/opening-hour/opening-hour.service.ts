import { Injectable } from '@nestjs/common';
import { CreateOpeningHourDto } from './dto/create-opening-hour.dto';
import { UpdateOpeningHourDto } from './dto/update-opening-hour.dto';

@Injectable()
export class OpeningHourService {
  create(createOpeningHourDto: CreateOpeningHourDto) {
    return 'This action adds a new openingHour';
  }

  findAll() {
    return `This action returns all openingHour`;
  }

  findOne(id: number) {
    return `This action returns a #${id} openingHour`;
  }

  update(id: number, updateOpeningHourDto: UpdateOpeningHourDto) {
    return `This action updates a #${id} openingHour`;
  }

  remove(id: number) {
    return `This action removes a #${id} openingHour`;
  }
}
