import { Test, TestingModule } from '@nestjs/testing';
import { DataSource } from 'typeorm';
import { OwnerService } from './owner.service';

describe('OwnerService', () => {
  let service: OwnerService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [OwnerService, { provide: DataSource, useValue: {} }],
    }).compile();

    service = module.get<OwnerService>(OwnerService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });
});
