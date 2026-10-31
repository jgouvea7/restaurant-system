import { Test, TestingModule } from '@nestjs/testing';
import { OpeningHourController } from './opening-hour.controller';
import { OpeningHourService } from './opening-hour.service';

describe('OpeningHourController', () => {
  let controller: OpeningHourController;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [OpeningHourController],
      providers: [{ provide: OpeningHourService, useValue: {} }],
    }).compile();

    controller = module.get<OpeningHourController>(OpeningHourController);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });
});
