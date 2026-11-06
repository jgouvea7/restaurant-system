import {
  Body,
  Controller,
  Delete,
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
  create(
    @Body() createProductDto: CreateProductDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.productsService.createForOwner(
      createProductDto,
      user.ownerId,
    );
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
  update(
    @Param('id') id: string,
    @Body() updateProductDto: UpdateProductDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.productsService.updateForOwner(
      id,
      updateProductDto,
      user.ownerId,
    );
  }

  @Delete(':id')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(AUTH_ROLES.OWNER)
  remove(
    @Param('id') id: string,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.productsService.removeForOwner(id, user.ownerId);
  }
}
