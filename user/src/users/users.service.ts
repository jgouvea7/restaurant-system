import {
  BadRequestException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { DataSource, Raw } from 'typeorm';
import * as bcrypt from 'bcrypt';
import { AUTH_ROLES, AuthRole } from '@restaurant/geolocation';
import { AuthenticateUserDto } from './dto/authenticate-user.dto';
import { UpdateUserDto } from './dto/update-user.dto';
import { User, userStatus } from './entities/user.entity';

export interface AuthenticatedUserRecord {
  userId: string;
  email: string;
  firstName: string;
  lastName: string;
  roles: AuthRole[];
  ownerId: string | null;
  courierId: string | null;
  costumerId: string | null;
}

@Injectable()
export class UsersService {
  constructor(private readonly dataSource: DataSource) {}

  async authenticate(
    authenticateUserDto: AuthenticateUserDto,
  ): Promise<AuthenticatedUserRecord> {
    const email = authenticateUserDto.email?.trim().toLowerCase();

    if (!email || !authenticateUserDto.password) {
      throw new BadRequestException('email e password sao obrigatorios');
    }

    const user = await this.dataSource.getRepository(User).findOne({
      where: {
        email: Raw((alias) => `LOWER(${alias}) = :email`, { email }),
      },
      relations: {
        costumer: true,
        courier: true,
        owner: true,
      },
    });

    if (
      !user ||
      user.status !== userStatus.ACTIVE ||
      !(await bcrypt.compare(authenticateUserDto.password, user.password))
    ) {
      throw new UnauthorizedException('Credenciais invalidas');
    }

    const roles: AuthRole[] = [];

    if (user.owner) {
      roles.push(AUTH_ROLES.OWNER);
    }

    if (user.courier) {
      roles.push(AUTH_ROLES.COURIER);
    }

    if (user.costumer) {
      roles.push(AUTH_ROLES.COSTUMER);
    }

    return {
      userId: user.id,
      email: user.email,
      firstName: user.firstName,
      lastName: user.lastName,
      roles,
      ownerId: user.owner?.id ?? null,
      courierId: user.courier?.courierId ?? null,
      costumerId: user.costumer?.costumerId ?? null,
    };
  }

  findAll() {
    return `This action returns all users`;
  }

  findOne(id: string) {
    return `This action returns a #${id} user`;
  }

  update(id: string, updateUserDto: UpdateUserDto) {
    return `This action updates a #${id} user`;
  }

  remove(id: string) {
    return `This action removes a #${id} user`;
  }
}
