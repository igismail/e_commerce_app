import { Module } from '@nestjs/common';
import { PassportModule } from '@nestjs/passport';
import { AuthModule } from '../auth/auth.module';
import { OrdersController } from './orders.controller';
import { OrdersService } from './orders.service';
import { OrderJobsService } from './order-jobs.service';
import { OrderJobsWorker } from './order-jobs.worker';
import { PAYMENT_PROVIDER } from './payment-provider';
import { StripePaymentProvider } from './stripe-payment.provider';
import { StripeWebhookController } from './stripe-webhook.controller';
import { StripeWebhookService } from './stripe-webhook.service';

@Module({
  imports: [AuthModule, PassportModule],
  controllers: [OrdersController, StripeWebhookController],
  providers: [
    OrdersService,
    OrderJobsService,
    OrderJobsWorker,
    StripeWebhookService,
    StripePaymentProvider,
    {
      provide: PAYMENT_PROVIDER,
      useExisting: StripePaymentProvider,
    },
  ],
})
export class OrdersModule {}
