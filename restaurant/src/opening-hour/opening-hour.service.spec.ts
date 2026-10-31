import { Test, TestingModule } from '@nestjs/testing';
import { OpeningHourService } from './opening-hour.service';

describe('OpeningHourService', () => {
  let service: OpeningHourService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [OpeningHourService],
    }).compile();

    service = module.get<OpeningHourService>(OpeningHourService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });
});
