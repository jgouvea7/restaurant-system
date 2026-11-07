import { Type } from 'class-transformer';
import {
  IsBoolean,
  IsEmail,
  IsEnum,
  IsNotEmpty,
  IsOptional,
  IsString,
  MaxLength,
  MinLength,
  ValidateNested,
} from 'class-validator';
import { VehicleType } from '../entities/courier.entity';

export class CourierProfileDto {
  @IsEnum(VehicleType)
  vehicleType!: VehicleType;

  @IsOptional()
  @IsBoolean()
  available?: boolean;
}

export class CreateCourierDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(100)
  firstName!: string;

  @IsString()
  @IsNotEmpty()
  @MaxLength(100)
  lastName!: string;

  @IsEmail()
  @MaxLength(320)
  email!: string;

  @IsString()
  @MinLength(8)
  @MaxLength(128)
  password!: string;

  @ValidateNested()
  @Type(() => CourierProfileDto)
  courier!: CourierProfileDto;
}
