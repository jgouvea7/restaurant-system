import { Injectable, NotFoundException } from '@nestjs/common';
import * as bcrypt from "bcrypt"
import { CreateCourierDto } from './dto/create-courier.dto';
import { UpdateCourierDto } from './dto/update-courier.dto';
import { DataSource } from 'typeorm';
import { User, userStatus } from 'src/users/entities/user.entity';
import { Courier, CourierAvailability } from './entities/courier.entity';

@Injectable()
export class CourierService {
  constructor(
    private readonly dataSource: DataSource,
  ){}

  async createUserCourier(dto: CreateCourierDto) {

    return this.dataSource.transaction(async (manager) => {

      const hashedPassowrd = await bcrypt.hash(dto.password, 12)

      const user = manager.create(User, {
        firstName: dto.firstName,
        lastName: dto.lastName,
        email: dto.email,
        password: hashedPassowrd,
        status: userStatus.ACTIVE,
      })

      await manager.save(user)

      const courierUser = manager.create(Courier, {
        vehicleType: dto.courier.vehicleType,
        available: CourierAvailability.UNAVAILABLE,
        user: user,
      })

      await manager.save(courierUser)

      return { user, courierUser }
    })
  }


  async updateCourierStatus(courierId: string) {

    const courier = await this.dataSource.getRepository(Courier).findOne({
      where: {
        courierId: courierId
      } 
    })

    if(!courier) {
      throw new NotFoundException("Erro usuário não encontrado")
    }

    if(courier.available === CourierAvailability.AVAILABLE) {
      courier.available = CourierAvailability.UNAVAILABLE
    } else {
      courier.available = CourierAvailability.AVAILABLE
    }
    

    await this.dataSource.getRepository(Courier).save(courier)

    return courier
  }


  getAllCourierUsers() {
    return this.dataSource.getRepository(Courier).find({
      relations: {
        user: true
      }
    })
  }
}
