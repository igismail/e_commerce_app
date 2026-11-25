import { Module } from '@nestjs/common';
import './environment';
import { randomUUID } from 'node:crypto';
import { LoggerModule } from 'nestjs-pino';
import { AuthModule } from './auth/auth.module';
import { CatalogModule } from './catalog/catalog.module';
import { HealthController } from './health.controller';
import { InfrastructureModule } from './infrastructure.module';
import { OrdersModule } from './orders/orders.module';
import { UsersModule } from './users/users.module';

@Module({
  imports: [
    LoggerModule.forRoot({
      pinoHttp: {
        level: process.env.LOG_LEVEL ?? 'info',
        genReqId: (request) => {
          const requestId = request.headers['x-request-id'];
          return typeof requestId === 'string' &&
            /^[A-Za-z0-9._:-]{1,128}$/.test(requestId)
            ? requestId
            : randomUUID();
        },
      },
    }),
    InfrastructureModule,
    AuthModule,
    CatalogModule,
    UsersModule,
    OrdersModule,
  ],
  controllers: [HealthController],
})
export class AppModule {}
