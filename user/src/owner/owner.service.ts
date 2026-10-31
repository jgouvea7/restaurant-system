import { Injectable } from '@nestjs/common';
import { CreateOwnerDto } from './dto/create-owner.dto';
import * as bcrypt from 'bcrypt'
import { UpdateOwnerDto } from './dto/update-owner.dto';
import { DataSource } from 'typeorm';
import { User, userStatus } from 'src/users/entities/user.entity';
import { Owner } from './entities/owner.entity';

@Injectable()
export class OwnerService {
  constructor(
    private readonly dataSource: DataSource,
  ) {}

  async createUserOwner(dto: CreateOwnerDto) {
    return this.dataSource.transaction(async (manager) => {
      const hashedPassword = await bcrypt.hash(dto.password, 12);

      const user = manager.create(User, {
        firstName: dto.firstName,
        lastName: dto.lastName,
        email: dto.email,
        password: hashedPassword,
        status: userStatus.ACTIVE
      })

      await manager.save(user)

      const ownerUser = manager.create(Owner, {
        document: dto.owner.document,
        user,
      })

      await manager.save(ownerUser);

      return { ownerUser }
    })
  }

  findAll() {
    return this.dataSource.getRepository(Owner).find()
  }

  findOwnerById(ownerId: string) {
    return this.dataSource.getRepository(Owner).findOne({
      where: {
        id: ownerId
      }
    })
  }
}
