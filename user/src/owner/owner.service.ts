import { CreateOwnerDto } from './dto/create-owner.dto';
import * as bcrypt from 'bcrypt';
import { BadRequestException, Injectable } from '@nestjs/common';
import { DataSource } from 'typeorm';
import {
  buildPage,
  decodeCursor,
  resolvePageLimit,
  type CursorPage,
} from '@restaurant/geolocation';
import { User, userStatus } from 'src/users/entities/user.entity';
import { Owner } from './entities/owner.entity';

@Injectable()
export class OwnerService {
  constructor(private readonly dataSource: DataSource) {}

  async createUserOwner(dto: CreateOwnerDto) {
    return this.dataSource.transaction(async (manager) => {
      const hashedPassword = await bcrypt.hash(dto.password, 12);

      const user = manager.create(User, {
        firstName: dto.firstName,
        lastName: dto.lastName,
        email: dto.email.trim().toLowerCase(),
        password: hashedPassword,
        status: userStatus.ACTIVE,
      });

      await manager.save(user);

      const ownerUser = manager.create(Owner, {
        document: dto.owner.document,
        user,
      });

      await manager.save(ownerUser);

      return {
        ownerUser: {
          id: ownerUser.id,
          document: ownerUser.document,
        },
      };
    });
  }

  async findAll(
    limitValue?: string | number,
    cursorValue?: string,
  ): Promise<CursorPage<Owner>> {
    const limit = resolvePageLimit(limitValue);
    const cursor = decodeCursor(cursorValue);

    if (cursorValue && !cursor) {
      throw new BadRequestException('cursor invalido');
    }

    const query = this.dataSource
      .getRepository(Owner)
      .createQueryBuilder('owner')
      .orderBy('owner.createdAt', 'DESC')
      .addOrderBy('owner.id', 'DESC')
      .take(limit + 1);

    if (cursor) {
      query.andWhere('(owner.createdAt, owner.id) < (:createdAt, :id)', {
        createdAt: cursor.createdAt,
        id: cursor.id,
      });
    }

    const rows = await query.getMany();

    return buildPage(rows, limit, (owner) => ({
      createdAt: owner.createdAt,
      id: owner.id,
    }));
  }

  findOwnerById(ownerId: string) {
    return this.dataSource.getRepository(Owner).findOne({
      where: {
        id: ownerId,
      },
    });
  }
}
