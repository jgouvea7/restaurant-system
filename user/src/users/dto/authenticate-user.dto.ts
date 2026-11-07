import { IsEmail, IsNotEmpty, IsString, MaxLength } from 'class-validator';

export class AuthenticateUserDto {
  @IsEmail()
  @MaxLength(320)
  email!: string;

  @IsString()
  @IsNotEmpty()
  @MaxLength(128)
  password!: string;
}
