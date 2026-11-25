import {
  Injectable,
  OnModuleDestroy,
  OnModuleInit,
} from '@nestjs/common';
import { Job, Worker } from 'bullmq';
import { InjectPinoLogger, PinoLogger } from 'nestjs-pino';
import { EmailService } from '../auth/email.service';
import { PrismaService } from '../prisma.service';
import { OrdersService } from './orders.service';
import {
  ORDER_JOBS_QUEUE,
  OrderJobData,
} from './order-jobs.service';
import { redisConnectionOptions } from './redis-options';

@Injectable()
export class OrderJobsWorker implements OnModuleInit, OnModuleDestroy {
  private worker?: Worker<OrderJobData>;

  constructor(
    private readonly prisma: PrismaService,
    private readonly orders: OrdersService,
    private readonly email: EmailService,
    @InjectPinoLogger(OrderJobsWorker.name)
    private readonly logger: PinoLogger,
  ) {}

  onModuleInit() {
    this.worker = new Worker<OrderJobData, void, string>(
      ORDER_JOBS_QUEUE,
      async (job) => this.process(job),
      { connection: redisConnectionOptions(), concurrency: 5 },
    );
    this.worker.on('failed', (job, error) => {
      this.logger.error(
        { jobId: job?.id, jobName: job?.name, err: error },
        'Background job failed',
      );
    });
    this.worker.on('error', (error) => {
      this.logger.error({ err: error }, 'Background job worker error');
    });
  }

  async onModuleDestroy() {
    await this.worker?.close();
  }

  private async process(job: Job<OrderJobData, void, string>) {
    switch (job.name) {
      case 'expire-payment-reservations':
        await this.orders.expirePendingOrders();
        return;
      case 'scan-abandoned-carts':
        await this.orders.enqueueAbandonedCartReminders();
        return;
      case 'order-confirmation':
        await this.sendOrderConfirmation(job.data);
        return;
      case 'abandoned-cart-reminder':
        if (!('cartId' in job.data) || !('lastActivityAt' in job.data)) {
          throw new Error('Abandoned-cart job payload is invalid');
        }
        await this.orders.sendAbandonedCartReminder(
          job.data.cartId,
          new Date(job.data.lastActivityAt),
        );
        return;
      case 'low-stock-alert':
        if (!('variantId' in job.data)) {
          throw new Error('Low-stock job payload is invalid');
        }
        await this.orders.sendLowStockAlert(job.data.variantId);
        return;
      default:
        throw new Error(`Unknown background job: ${job.name}`);
    }
  }

  private async sendOrderConfirmation(data: OrderJobData) {
    if (!('orderId' in data)) {
      throw new Error('Order-confirmation job payload is invalid');
    }
    const order = await this.prisma.order.findUnique({
      where: { id: data.orderId },
      include: {
        user: { select: { email: true, firstName: true } },
        items: { select: { productName: true, variantName: true, quantity: true } },
      },
    });
    if (!order) {
      throw new Error('Order-confirmation job references a missing order');
    }
    if (!order.user) {
      this.logger.warn(
        { orderId: order.id },
        'Order confirmation skipped because the account no longer exists',
      );
      return;
    }
    await this.email.sendOrderConfirmationEmail({
      to: order.user.email,
      firstName: order.user.firstName,
      orderNumber: order.orderNumber,
      currency: order.currency,
      totalAmount: order.totalAmount,
      items: order.items,
    });
  }
}
