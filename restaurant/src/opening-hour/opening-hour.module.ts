import { Module } from '@nestjs/common';
import { OpeningHourService } from './opening-hour.service';
import { OpeningHourController } from './opening-hour.controller';

@Module({
  controllers: [OpeningHourController],
  providers: [OpeningHourService],
})
export class OpeningHourModule {}
