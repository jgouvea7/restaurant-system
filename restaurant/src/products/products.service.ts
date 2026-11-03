import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { DataSource } from 'typeorm';
import { CreateProductDto } from './dto/create-product.dto';
import { UpdateProductDto } from './dto/update-product.dto';
import { Product } from './entities/product.entity';
import { Restaurant } from '../restaurants/entities/restaurant.entity';

@Injectable()
export class ProductsService {
  constructor(private readonly dataSource: DataSource) {}

  async create(dto: CreateProductDto) {
    const restaurant = await this.dataSource
      .getRepository(Restaurant)
      .findOne({ where: { id: dto.restaurantId } });

    if (!restaurant) {
      throw new NotFoundException('Restaurante nao encontrado');
    }

    const price = this.parsePrice(dto.price);

    const product = this.dataSource.getRepository(Product).create({
      name: dto.name,
      description: dto.description,
      price: price.toFixed(2),
      imageUrl: dto.imageUrl,
      isAvailable: dto.isAvailable ?? true,
      isActive: dto.isActive ?? true,
      preparationTimeMinutes: dto.preparationTimeMinutes,
      restaurant,
    });

    return this.dataSource.getRepository(Product).save(product);
  }

  findAll(restaurantId?: string) {
    return this.dataSource.getRepository(Product).find({
      where: restaurantId ? { restaurant: { id: restaurantId } } : {},
      order: { createdAt: 'DESC' },
    });
  }

  async findOne(id: string) {
    const product = await this.dataSource
      .getRepository(Product)
      .findOne({ where: { id } });

    if (!product) {
      throw new NotFoundException('Produto nao encontrado');
    }

    return product;
  }

  async update(id: string, dto: UpdateProductDto) {
    const repository = this.dataSource.getRepository(Product);
    const product = await this.findOne(id);

    if (dto.name !== undefined) {
      product.name = dto.name;
    }

    if (dto.description !== undefined) {
      product.description = dto.description;
    }

    if (dto.price !== undefined) {
      product.price = this.parsePrice(dto.price).toFixed(2);
    }

    if (dto.imageUrl !== undefined) {
      product.imageUrl = dto.imageUrl;
    }

    if (dto.isAvailable !== undefined) {
      product.isAvailable = dto.isAvailable;
    }

    if (dto.isActive !== undefined) {
      product.isActive = dto.isActive;
    }

    if (dto.preparationTimeMinutes !== undefined) {
      product.preparationTimeMinutes = dto.preparationTimeMinutes;
    }

    return repository.save(product);
  }

  async remove(id: string) {
    const product = await this.findOne(id);

    await this.dataSource.getRepository(Product).delete(product.id);

    return product;
  }

  private parsePrice(value: number): number {
    const price = Number(value);

    if (!Number.isFinite(price) || price < 0) {
      throw new BadRequestException('price invalido');
    }

    return price;
  }
}
