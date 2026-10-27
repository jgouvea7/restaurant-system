import { Injectable } from '@nestjs/common';
import { CreateCostumerDto } from './dto/create-costumer.dto';
import { UpdateCostumerDto } from './dto/update-costumer.dto';
import { DataSource } from 'typeorm';
import * as bcrypt from "bcrypt"
import { User, userStatus } from 'src/users/entities/user.entity';
import { Costumer } from './entities/costumer.entity';
import { Address } from 'src/address/entities/address.entity';
import { AddressService } from 'src/address/address.service';

@Injectable()
export class CostumerService {
  constructor(
    private readonly dataSource: DataSource,
    private readonly addressService: AddressService,
  ){}

  async createUserCostumer(dto: CreateCostumerDto) {


    return this.dataSource.transaction(async (manager) => {

      const hashedPassowrd = await bcrypt.hash(dto.password, 12);

      const user = manager.create(User, {
        firstName: dto.firstName,
        lastName: dto.lastName,
        email: dto.email,
        password: hashedPassowrd,
        status: userStatus.ACTIVE
      });

      await manager.save(user);

      const costumerUser = manager.create(Costumer, {
        phone: dto.costumer.phone,
        user,
      })
      await manager.save(costumerUser);

      const responseAddress = await this.addressService.findAddressByCep(dto.costumer.address.postalCode);

      if(!responseAddress) {
        throw new Error("CEP não encontrado");
      }

      const addressData = await responseAddress.json()

      const cordinates = await this.addressService.findCordByAddress({ 
        street: addressData.logradouro,
        number: dto.costumer.address.number,
        city: addressData.localidade,
        state: addressData.uf,
      })

      if (responseAddress) {
          const addressUser = manager.create(Address, {
            street: addressData.logradouro,
            number: dto.costumer.address.number,
            city: addressData.localidade,
            state: addressData.uf,
            postalCode: dto.costumer.address.postalCode,
            latitude: cordinates?.latitude,
            longitude: cordinates?.longitude,
            costumer: costumerUser
        })
        
        await manager.save(addressUser)

        return { user, costumerUser }
      }
    })
    
  }

  getAllCostumerUsers() {
    return this.dataSource.getRepository(Costumer).find({
      relations: {
        user: true,
        address: true,
      }
    })
  }
}
