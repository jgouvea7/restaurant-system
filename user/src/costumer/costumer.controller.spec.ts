import { Test, TestingModule } from '@nestjs/testing';
import { CostumerController } from './costumer.controller';
import { CostumerService } from './costumer.service';

describe('CostumerController', () => {
  let controller: CostumerController;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [CostumerController],
      providers: [{ provide: CostumerService, useValue: {} }],
    }).compile();

    controller = module.get<CostumerController>(CostumerController);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });
});
