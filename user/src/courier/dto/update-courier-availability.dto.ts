import { IsBoolean } from 'class-validator';

export class UpdateCourierAvailabilityDto {
  @IsBoolean()
  available!: boolean;
}
