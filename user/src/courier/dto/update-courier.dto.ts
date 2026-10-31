import { PartialType } from '../../common/partial-type';
import { CreateCourierDto } from './create-courier.dto';

export class UpdateCourierDto extends PartialType(CreateCourierDto) {}
