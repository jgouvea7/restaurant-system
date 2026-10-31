import { Test, TestingModule } from '@nestjs/testing';
import { DataSource } from 'typeorm';
import { CourierService } from './courier.service';

describe('CourierService', () => {
  let service: CourierService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [CourierService, { provide: DataSource, useValue: {} }],
    }).compile();

    service = module.get<CourierService>(CourierService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });
});
