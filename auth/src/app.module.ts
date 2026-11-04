import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { AuthModule } from './auth/auth.module';

@Module({
  imports: [
    TypeOrmModule.forRoot({
      type: 'postgres',
      host: process.env.DB_HOST ?? 'localhost',
      port: Number(process.env.DB_PORT ?? 17004),
      username: process.env.DB_USER ?? 'restaurant',
      password: process.env.DB_PASSWORD ?? 'restaurant1234',
      database: process.env.DB_NAME ?? 'auth',
      autoLoadEntities: true,
      synchronize: true,
      retryAttempts: 30,
      retryDelay: 2000,
    }),
    AuthModule,
  ],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}
