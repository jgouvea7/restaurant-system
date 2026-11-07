import { BadRequestException, Injectable } from '@nestjs/common';
import { CreateCostumerDto } from './dto/create-costumer.dto';
import { DataSource } from 'typeorm';
import * as bcrypt from 'bcrypt';
import { User, userStatus } from 'src/users/entities/user.entity';
import { Costumer } from './entities/costumer.entity';
import { Address } from 'src/address/entities/address.entity';
import {
  buildPage,
  decodeCursor,
  GeolocationService,
  resolvePageLimit,
  type CursorPage,
} from '@restaurant/geolocation';

export interface PublicCostumer {
  costumerId: string;
  phone: string;
  address: Address[];
  user: {
    id: string;
    firstName: string;
    lastName: string;
    email: string;
    status: string;
  } | null;
}

@Injectable()
export class CostumerService {
  constructor(
    private readonly dataSource: DataSource,
    private readonly geolocationService: GeolocationService,
  ) {}

  async createUserCostumer(dto: CreateCostumerDto) {
    return this.dataSource.transaction(async (manager) => {
      const hashedPassowrd = await bcrypt.hash(dto.password, 12);

      const user = manager.create(User, {
        firstName: dto.firstName,
        lastName: dto.lastName,
        email: dto.email.trim().toLowerCase(),
        password: hashedPassowrd,
        status: userStatus.ACTIVE,
      });

      await manager.save(user);

      const costumerUser = manager.create(Costumer, {
        phone: dto.costumer.phone,
        user,
      });
      await manager.save(costumerUser);

      const addressData = await this.geolocationService.findAddressByCep(
        dto.costumer.address.postalCode,
      );

      if (!addressData) {
        throw new Error('CEP não encontrado');
      }

      const cordinates = await this.geolocationService.findCordByAddress({
        street: addressData.logradouro,
        number: dto.costumer.address.number,
        city: addressData.localidade,
        state: addressData.uf,
      });

      const addressUser = manager.create(Address, {
        street: addressData.logradouro,
        number: dto.costumer.address.number,
        city: addressData.localidade,
        state: addressData.uf,
        postalCode: dto.costumer.address.postalCode,
        latitude: cordinates?.latitude,
        longitude: cordinates?.longitude,
        costumer: costumerUser,
      });

      await manager.save(addressUser);

      return {
        user: {
          id: user.id,
          firstName: user.firstName,
          lastName: user.lastName,
          email: user.email,
          status: user.status,
        },
        costumerUser: {
          costumerId: costumerUser.costumerId,
          phone: costumerUser.phone,
        },
      };
    });
  }

  async getAllCostumerUsers(
    limitValue?: string | number,
    cursorValue?: string,
  ): Promise<CursorPage<PublicCostumer>> {
    const limit = resolvePageLimit(limitValue);
    const cursor = decodeCursor(cursorValue);

    if (cursorValue && !cursor) {
      throw new BadRequestException('cursor invalido');
    }

    const query = this.dataSource
      .getRepository(Costumer)
      .createQueryBuilder('costumer')
      .leftJoinAndSelect('costumer.user', 'user')
      .leftJoinAndSelect('costumer.address', 'address')
      .orderBy('user.createdAt', 'DESC')
      .addOrderBy('user.id', 'DESC')
      .take(limit + 1);

    if (cursor) {
      query.andWhere('(user.createdAt, user.id) < (:createdAt, :id)', {
        createdAt: cursor.createdAt,
        id: cursor.id,
      });
    }

    const rows = await query.getMany();
    const page = buildPage(rows, limit, (costumer) => ({
      createdAt: costumer.user?.createdAt ?? new Date(0),
      id: costumer.user?.id ?? costumer.costumerId,
    }));

    return {
      items: page.items.map((costumer) => ({
        costumerId: costumer.costumerId,
        phone: costumer.phone,
        address: costumer.address,
        user: costumer.user
          ? {
              id: costumer.user.id,
              firstName: costumer.user.firstName,
              lastName: costumer.user.lastName,
              email: costumer.user.email,
              status: costumer.user.status,
            }
          : null,
      })),
      nextCursor: page.nextCursor,
    };
  }
}
