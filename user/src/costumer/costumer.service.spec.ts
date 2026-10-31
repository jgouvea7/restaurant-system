import { Test, TestingModule } from '@nestjs/testing';
import { DataSource } from 'typeorm';
import { GeolocationModule } from '@restaurant/geolocation';
import { CostumerService } from './costumer.service';

describe('CostumerService', () => {
  let service: CostumerService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      imports: [GeolocationModule],
      providers: [
        CostumerService,
        { provide: DataSource, useValue: {} },
      ],
    }).compile();

    service = module.get<CostumerService>(CostumerService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });
});
