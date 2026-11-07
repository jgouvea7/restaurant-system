import { Type } from 'class-transformer';
import {
  IsEmail,
  IsNotEmpty,
  IsString,
  Matches,
  MaxLength,
  MinLength,
  ValidateNested,
} from 'class-validator';

export class CostumerAddressDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(200)
  street!: string;

  @IsString()
  @IsNotEmpty()
  @MaxLength(20)
  number!: string;

  @IsString()
  @IsNotEmpty()
  @MaxLength(120)
  city!: string;

  @IsString()
  @IsNotEmpty()
  @MaxLength(2)
  state!: string;

  @Matches(/^\d{5}-?\d{3}$/)
  postalCode!: string;
}

export class CostumerProfileDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(20)
  phone!: string;

  @ValidateNested()
  @Type(() => CostumerAddressDto)
  address!: CostumerAddressDto;
}

export class CreateCostumerDto {
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
  @Type(() => CostumerProfileDto)
  costumer!: CostumerProfileDto;
}
