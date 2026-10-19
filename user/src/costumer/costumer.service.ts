import { Injectable } from '@nestjs/common';
import { CreateCostumerDto } from './dto/create-costumer.dto';
import { UpdateCostumerDto } from './dto/update-costumer.dto';

@Injectable()
export class CostumerService {
  create(createCostumerDto: CreateCostumerDto) {
    return 'This action adds a new costumer';
  }

  findAll() {
    return `This action returns all costumer`;
  }

  findOne(id: number) {
    return `This action returns a #${id} costumer`;
  }

  update(id: number, updateCostumerDto: UpdateCostumerDto) {
    return `This action updates a #${id} costumer`;
  }

  remove(id: number) {
    return `This action removes a #${id} costumer`;
  }
}
