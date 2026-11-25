import { Injectable, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { Queue } from 'bullmq';
import { redisConnectionOptions } from './redis-options';

export const ORDER_JOBS_QUEUE = 'commerce-order-jobs';

export type OrderJobData =
  | { orderId: string }
  | { cartId: string; lastActivityAt: string }
  | { variantId: string }
  | Record<string, never>;

@Injectable()
export class OrderJobsService implements OnModuleInit, OnModuleDestroy {
  private readonly queue = new Queue<OrderJobData, void, string>(
    ORDER_JOBS_QUEUE,
    {
      connection: redisConnectionOptions(),
    },
  );

  async onModuleInit() {
    await Promise.all([
      this.queue.upsertJobScheduler(
        'expire-payment-reservations',
        { every: 60_000 },
        {
          name: 'expire-payment-reservations',
          data: {},
          opts: { removeOnComplete: 100, removeOnFail: 100 },
        },
      ),
      this.queue.upsertJobScheduler(
        'scan-abandoned-carts',
        { every: 60 * 60 * 1000 },
        {
          name: 'scan-abandoned-carts',
          data: {},
          opts: { removeOnComplete: 100, removeOnFail: 100 },
        },
      ),
    ]);
  }

  async onModuleDestroy() {
    await this.queue.close();
  }

  async enqueueOrderConfirmation(orderId: string) {
    await this.queue.add(
      'order-confirmation',
      { orderId },
      this.retryOptions(`order_confirmation_${orderId}`),
    );
  }

  async enqueueAbandonedCartReminder(
    cartId: string,
    lastActivityAt: Date,
  ) {
    await this.queue.add(
      'abandoned-cart-reminder',
      { cartId, lastActivityAt: lastActivityAt.toISOString() },
      this.retryOptions(`cart_reminder_${cartId}_${lastActivityAt.getTime()}`),
    );
  }

  async enqueueLowStockAlert(variantId: string) {
    await this.queue.add(
      'low-stock-alert',
      { variantId },
      this.retryOptions(`low_stock_${variantId}`),
    );
  }

  private retryOptions(jobId: string) {
    return {
      jobId,
      attempts: 5,
      backoff: { type: 'exponential' as const, delay: 2_000 },
      removeOnComplete: 1_000,
      removeOnFail: 10_000,
    };
  }
}
