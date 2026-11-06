import { Module } from '@nestjs/common';
import { ObservabilityModule } from '@restaurant/geolocation';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { PaymentsModule } from './payments/payments.module';
import { HealthModule } from './health/health.module';
import { OutboxModule } from './outbox/outbox.module';

@Module({
  imports: [
    TypeOrmModule.forRoot({
      type: 'postgres',
      host: process.env.DB_HOST ?? 'localhost',
      port: Number(process.env.DB_PORT ?? 17003),
      username: process.env.DB_USER ?? 'restaurant',
      password: process.env.DB_PASSWORD ?? 'restaurant1234',
      database: process.env.DB_NAME ?? 'payments',
      autoLoadEntities: true,
      synchronize: process.env.DB_SYNCHRONIZE === 'true',
      migrations: [__dirname + '/migrations/*{.ts,.js}'],
      migrationsRun: process.env.DB_MIGRATIONS_RUN !== 'false',
      retryAttempts: 30,
      retryDelay: 2000,
    }),
    PaymentsModule,
    OutboxModule,
    HealthModule,
    ObservabilityModule,
  ],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}
