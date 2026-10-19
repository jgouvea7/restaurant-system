import { Module } from '@nestjs/common';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { UsersModule } from './users/users.module';
import { CostumerModule } from './costumer/costumer.module';
import { CourierModule } from './courier/courier.module';
import { AddressModule } from './address/address.module';

@Module({
  imports: [UsersModule, CostumerModule, CourierModule, AddressModule],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}
