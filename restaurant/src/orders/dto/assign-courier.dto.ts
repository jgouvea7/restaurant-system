import { IsOptional, IsUUID } from 'class-validator';

export class AssignCourierDto {
  @IsOptional()
  @IsUUID()
  courierId?: string;
}
