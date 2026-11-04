import {
  Body,
  Controller,
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
import { OrdersService } from './orders.service';
import { AssignCourierDto } from './dto/assign-courier.dto';
import { CreateOrderDto } from './dto/create-order.dto';
import { UpdateOrderStatusDto } from './dto/update-order-status.dto';

@Controller('orders')
@UseGuards(JwtAuthGuard, RolesGuard)
export class OrdersController {
  constructor(private readonly ordersService: OrdersService) {}

  @Post()
  @Roles(AUTH_ROLES.COSTUMER)
  create(
    @Body() createOrderDto: CreateOrderDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    if (createOrderDto.costumerUserId !== user.userId) {
      throw new ForbiddenException('Pedido deve ser criado pelo proprio cliente');
    }

    return this.ordersService.create(createOrderDto);
  }

  @Get()
  findAll(
    @Query('restaurantId') restaurantId: string | undefined,
    @Query('costumerUserId') costumerUserId: string | undefined,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.ordersService.findAllForUser(
      restaurantId,
      costumerUserId,
      user,
    );
  }

  @Get(':id')
  findOne(@Param('id') id: string, @CurrentUser() user: AuthenticatedUser) {
    return this.ordersService.findOneForUser(id, user);
  }

  @Patch(':id/status')
  updateStatus(
    @Param('id') id: string,
    @Body() updateOrderStatusDto: UpdateOrderStatusDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.ordersService.updateStatusForUser(
      id,
      updateOrderStatusDto.status,
      user,
    );
  }

  @Patch(':id/courier')
  @Roles(AUTH_ROLES.OWNER)
  assignCourier(
    @Param('id') id: string,
    @Body() assignCourierDto: AssignCourierDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    if (!user.ownerId) {
      throw new ForbiddenException('Owner sem vinculo');
    }

    return this.ordersService.assignCourier(
      id,
      user.ownerId,
      assignCourierDto.courierId,
    );
  }
}
