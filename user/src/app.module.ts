import { Module } from '@nestjs/common';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { UsersModule } from './users/users.module';
import { CostumerModule } from './costumer/costumer.module';
import { CourierModule } from './courier/courier.module';
import { AddressModule } from './address/address.module';
import { TypeOrmModule } from '@nestjs/typeorm';
import { OwnerModule } from './owner/owner.module';

@Module({
  imports: [
    TypeOrmModule.forRoot({
      type: "postgres",
      host: process.env.DB_HOST ?? "localhost",
      port: Number(process.env.DB_PORT ?? 17001),
      username: process.env.DB_USER ?? "restaurant",
      password: process.env.DB_PASSWORD ?? "restaurant1234",
      database: process.env.DB_NAME ?? "users",
      autoLoadEntities: true,
      synchronize: true,
      retryAttempts: 30,
      retryDelay: 2000
    }),UsersModule, CostumerModule, CourierModule, AddressModule, OwnerModule],
  controllers: [AppController],
  providers: [AppService],
})

export class AppModule {}
