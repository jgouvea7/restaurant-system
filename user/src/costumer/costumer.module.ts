import { Module } from '@nestjs/common';
import { CostumerService } from './costumer.service';
import { CostumerController } from './costumer.controller';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Address } from 'src/address/entities/address.entity';
import { Costumer } from './entities/costumer.entity';
import { User } from 'src/users/entities/user.entity';

@Module({
  imports: [TypeOrmModule.forFeature([User, Costumer, Address])],
  controllers: [CostumerController],
  providers: [CostumerService],
})
export class CostumerModule {}
