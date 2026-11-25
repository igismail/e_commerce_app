import {
  Inject,
  Injectable,
  ServiceUnavailableException,
} from '@nestjs/common';
import {
  OrderStatus,
  PaymentStatus,
  Prisma,
} from '../generated/prisma/client';
import { PrismaService } from '../prisma.service';
import { OrdersService } from './orders.service';
import { PAYMENT_PROVIDER, PaymentProvider } from './payment-provider';

@Injectable()
export class StripeWebhookService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly orders: OrdersService,
    @Inject(PAYMENT_PROVIDER)
    private readonly paymentProvider: PaymentProvider,
  ) {}

  async handle(rawBody: Buffer, signature: string) {
    const event = this.paymentProvider.verifyWebhook(rawBody, signature);
    const outcome = await this.prisma.$transaction(async (transaction) => {
      await transaction.paymentWebhookEvent.createMany({
        data: [
          {
            externalEventId: event.id,
            eventType: event.type,
            payload: this.eventPayload(event),
          },
        ],
        skipDuplicates: true,
      });
      const eventRecord = await transaction.paymentWebhookEvent.findUniqueOrThrow({
        where: { externalEventId: event.id },
      });
      if (eventRecord.processedAt) {
        return { processed: true } as const;
      }

      const payment =
        event.paymentId || event.paymentIntentId
          ? await transaction.payment.findFirst({
              where: {
                provider: 'STRIPE',
                OR: [
                  ...(event.paymentId ? [{ id: event.paymentId }] : []),
                  ...(event.paymentIntentId
                    ? [{ externalReference: event.paymentIntentId }]
                    : []),
                ],
              },
              include: { order: true },
            })
          : null;

      if (!payment || (!event.status && event.type !== 'charge.refunded')) {
        await transaction.paymentWebhookEvent.update({
          where: { externalEventId: event.id },
          data: {
            paymentId: payment?.id ?? null,
            processedAt: new Date(),
          },
        });
        return { processed: false } as const;
      }

      if (event.paymentIntentId && !payment.externalReference) {
        await transaction.payment.update({
          where: { id: payment.id },
          data: { externalReference: event.paymentIntentId },
        });
      }

      if (
        event.paymentIntentId &&
        payment.externalReference &&
        event.paymentIntentId !== payment.externalReference
      ) {
        throw new Error('Stripe payment reference does not match the stored payment');
      }
      if (
        event.amount !== undefined &&
        event.type.startsWith('payment_intent.') &&
        event.amount !== payment.amount
      ) {
        throw new Error('Stripe payment amount does not match the stored order');
      }
      if (
        event.currency &&
        event.type.startsWith('payment_intent.') &&
        event.currency.toUpperCase() !== payment.currency
      ) {
        throw new Error('Stripe payment currency does not match the stored order');
      }

      await transaction.paymentWebhookEvent.update({
        where: { externalEventId: event.id },
        data: {
          paymentId: payment.id,
          ...(event.paymentIntentId
            ? {
                payload: {
                  ...this.eventPayload(event),
                  paymentIntentId: event.paymentIntentId,
                },
              }
            : {}),
        },
      });
      if (
        event.status === 'succeeded' &&
        event.type === 'payment_intent.succeeded'
      ) {
        await transaction.payment.update({
          where: { id: payment.id },
          data: {
            ...(event.paymentIntentId
              ? { externalReference: event.paymentIntentId }
              : {}),
          },
        });
        const result = await this.orders.completePayment(
          transaction,
          payment.id,
        );
        if (result.latePayment) {
          return {
            processed: false,
            latePaymentId: payment.id,
            paymentIntentId: event.paymentIntentId,
          } as const;
        }
        return {
          processed: false,
          confirmationOrderId: result.orderId,
        } as const;
      }

      if (
        event.status === 'canceled' &&
        event.type === 'payment_intent.canceled'
      ) {
        await this.orders.cancelPendingOrder(
          transaction,
          payment.orderId,
        );
        await transaction.payment.updateMany({
          where: {
            id: payment.id,
            status: { not: PaymentStatus.SUCCEEDED },
          },
          data: { status: PaymentStatus.CANCELLED },
        });
      } else if (
        event.status === 'failed' &&
        event.type === 'payment_intent.payment_failed'
      ) {
        await transaction.payment.updateMany({
          where: {
            id: payment.id,
            status: {
              notIn: [
                PaymentStatus.SUCCEEDED,
                PaymentStatus.REFUNDED,
                PaymentStatus.PARTIALLY_REFUNDED,
              ],
            },
          },
          data: { status: PaymentStatus.FAILED },
        });
      } else if (
        event.status === 'processing' &&
        event.type === 'payment_intent.processing'
      ) {
        await transaction.payment.updateMany({
          where: {
            id: payment.id,
            status: {
              notIn: [
                PaymentStatus.SUCCEEDED,
                PaymentStatus.REFUNDED,
                PaymentStatus.PARTIALLY_REFUNDED,
                PaymentStatus.CANCELLED,
              ],
            },
          },
          data: { status: PaymentStatus.PROCESSING },
        });
      } else if (
        event.type === 'charge.refunded' &&
        event.amountRefunded !== undefined
      ) {
        const fullyRefunded = event.amountRefunded >= payment.amount;
        await transaction.payment.update({
          where: { id: payment.id },
          data: {
            status: fullyRefunded
              ? PaymentStatus.REFUNDED
              : PaymentStatus.PARTIALLY_REFUNDED,
          },
        });
        if (fullyRefunded) {
          await transaction.order.updateMany({
            where: {
              id: payment.orderId,
              status: {
                in: [
                  OrderStatus.PAID,
                  OrderStatus.PROCESSING,
                  OrderStatus.CANCELLED,
                ],
              },
            },
            data: { status: OrderStatus.REFUNDED },
          });
        }
      }

      await transaction.paymentWebhookEvent.update({
        where: { externalEventId: event.id },
        data: { processedAt: new Date() },
      });
      return { processed: false } as const;
    });

    if ('latePaymentId' in outcome) {
      if (!outcome.paymentIntentId) {
        throw new Error('Late Stripe payment is missing its provider reference');
      }
      const refund = await this.paymentProvider.refundPaymentIntent(
        outcome.paymentIntentId,
        `late-payment-refund:${outcome.latePaymentId}`,
      );
      if (refund.status !== 'succeeded') {
        throw new ServiceUnavailableException(
          'Late payment refund is still processing',
        );
      }
      await this.prisma.$transaction(async (transaction) => {
        const payment = await transaction.payment.findUniqueOrThrow({
          where: { id: outcome.latePaymentId },
        });
        await transaction.payment.update({
          where: { id: payment.id },
          data: { status: PaymentStatus.REFUNDED },
        });
        await transaction.order.update({
          where: { id: payment.orderId },
          data: { status: OrderStatus.REFUNDED },
        });
        await transaction.paymentWebhookEvent.update({
          where: { externalEventId: event.id },
          data: { processedAt: new Date() },
        });
      });
    } else if ('confirmationOrderId' in outcome && outcome.confirmationOrderId) {
      await this.orders.notifyPaymentSucceeded(outcome.confirmationOrderId);
      await this.prisma.paymentWebhookEvent.update({
        where: { externalEventId: event.id },
        data: { processedAt: new Date() },
      });
    }

    return { received: true };
  }

  private eventPayload(event: {
    id: string;
    type: string;
    paymentId?: string;
    paymentIntentId?: string;
    status?: string;
    amount?: number;
    amountRefunded?: number;
    currency?: string;
  }): Prisma.InputJsonObject {
    return {
      eventId: event.id,
      eventType: event.type,
      ...(event.paymentId ? { paymentId: event.paymentId } : {}),
      ...(event.paymentIntentId
        ? { paymentIntentId: event.paymentIntentId }
        : {}),
      ...(event.status ? { status: event.status } : {}),
      ...(event.amount !== undefined ? { amount: event.amount } : {}),
      ...(event.amountRefunded !== undefined
        ? { amountRefunded: event.amountRefunded }
        : {}),
      ...(event.currency ? { currency: event.currency } : {}),
    };
  }
}
