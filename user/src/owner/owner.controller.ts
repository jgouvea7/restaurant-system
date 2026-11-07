import {
  Body,
  Controller,
  ForbiddenException,
  Get,
  Param,
  ParseUUIDPipe,
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
import { OwnerService } from './owner.service';
import { CreateOwnerDto } from './dto/create-owner.dto';

@Controller('owner')
export class OwnerController {
  constructor(private readonly ownerService: OwnerService) {}

  @Post()
  create(@Body() createOwnerDto: CreateOwnerDto) {
    return this.ownerService.createUserOwner(createOwnerDto);
  }

  @Get()
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(AUTH_ROLES.OWNER)
  findAll(@Query('limit') limit?: string, @Query('cursor') cursor?: string) {
    return this.ownerService.findAll(limit, cursor);
  }

  @Get(':id')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(AUTH_ROLES.OWNER)
  findOwner(
    @Param('id', ParseUUIDPipe) ownerId: string,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    if (user.ownerId !== ownerId) {
      throw new ForbiddenException('Owner de outro usuario');
    }

    return this.ownerService.findOwnerById(ownerId);
  }
}
