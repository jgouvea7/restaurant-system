import { PartialType } from '../../common/partial-type';
import { CreateOpeningHourDto } from './create-opening-hour.dto';

export class UpdateOpeningHourDto extends PartialType(CreateOpeningHourDto) {}
