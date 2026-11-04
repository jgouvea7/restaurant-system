import {
  Body,
  Controller,
  Delete,
  ForbiddenException,
  Get,
  Param,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import {
  AUTH_ROLES,
  CurrentUser,
  JwtAuthGuard,
  Roles,
  RolesGuard,
} from '@restaurant/geolocation';
import type { AuthenticatedUser } from '@restaurant/geolocation';
import { ProductsService } from './products.service';
import { CreateProductDto } from './dto/create-product.dto';
import { UpdateProductDto } from './dto/update-product.dto';

@Controller('products')
export class ProductsController {
  constructor(private readonly productsService: ProductsService) {}

  @Post()
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(AUTH_ROLES.OWNER)
  async create(
    @Body() createProductDto: CreateProductDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    if (!user.ownerId) {
      throw new ForbiddenException('Owner sem vinculo');
    }

    await this.productsService.ensureOwnedByRestaurant(
      createProductDto.restaurantId,
      user.ownerId,
    );
    return this.productsService.create(createProductDto);
  }

  @Get()
  findAll(@Query('restaurantId') restaurantId?: string) {
    return this.productsService.findAll(restaurantId);
  }

  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.productsService.findOne(id);
  }

  @Patch(':id')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(AUTH_ROLES.OWNER)
  async update(
    @Param('id') id: string,
    @Body() updateProductDto: UpdateProductDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    await this.assertOwner(id, user);
    return this.productsService.update(id, updateProductDto);
  }

  @Delete(':id')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(AUTH_ROLES.OWNER)
  async remove(
    @Param('id') id: string,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    await this.assertOwner(id, user);
    return this.productsService.remove(id);
  }

  private async assertOwner(id: string, user: AuthenticatedUser) {
    if (!user.ownerId) {
      throw new ForbiddenException('Owner sem vinculo');
    }

    await this.productsService.ensureOwnedByProduct(id, user.ownerId);
  }
}
