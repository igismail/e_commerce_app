import { StripeWebhookService } from '../dist/orders/stripe-webhook.service';
import { PaymentStatus } from '../dist/generated/prisma/client';

describe('StripeWebhookService', () => {
  function makeService() {
    const event = {
      id: 'evt_success',
      type: 'payment_intent.succeeded',
      paymentId: 'payment-1',
      paymentIntentId: 'pi_test',
      status: 'succeeded' as const,
      amount: 3305,
      currency: 'usd',
    };
    const transaction = {
      paymentWebhookEvent: {
        createMany: jest.fn().mockResolvedValue({ count: 1 }),
        findUniqueOrThrow: jest.fn().mockResolvedValue({
          processedAt: null,
        }),
        update: jest.fn().mockResolvedValue(undefined),
      },
      payment: {
        findFirst: jest.fn().mockResolvedValue({
          id: 'payment-1',
          orderId: 'order-1',
          externalReference: 'pi_test',
          status: PaymentStatus.REQUIRES_PAYMENT_METHOD,
          amount: 3305,
          currency: 'USD',
          order: { id: 'order-1' },
        }),
        update: jest.fn().mockResolvedValue(undefined),
        updateMany: jest.fn(),
      },
      order: { update: jest.fn() },
    };
    const prisma = {
      $transaction: jest.fn((callback) => callback(transaction)),
      paymentWebhookEvent: { update: jest.fn().mockResolvedValue(undefined) },
    };
    const orders = {
      completePayment: jest
        .fn()
        .mockResolvedValue({ orderId: 'order-1', latePayment: false }),
      cancelPendingOrder: jest.fn(),
      notifyPaymentSucceeded: jest.fn().mockResolvedValue(undefined),
    };
    const provider = {
      verifyWebhook: jest.fn().mockReturnValue(event),
      refundPaymentIntent: jest.fn(),
    };
    return {
      service: new StripeWebhookService(
        prisma as never,
        orders as never,
        provider as never,
      ),
      prisma,
      transaction,
      orders,
      provider,
      event,
    };
  }

  it('verifies, applies, and queues a successful payment exactly once', async () => {
    const { service, prisma, transaction, orders, provider, event } =
      makeService();

    await expect(service.handle(Buffer.from('{}'), 'signature')).resolves.toEqual({
      received: true,
    });

    expect(provider.verifyWebhook).toHaveBeenCalledWith(
      Buffer.from('{}'),
      'signature',
    );
    expect(transaction.paymentWebhookEvent.createMany).toHaveBeenCalledWith(
      expect.objectContaining({ skipDuplicates: true }),
    );
    expect(orders.completePayment).toHaveBeenCalledWith(
      transaction,
      'payment-1',
    );
    expect(orders.notifyPaymentSucceeded).toHaveBeenCalledWith('order-1');
    expect(prisma.paymentWebhookEvent.update).toHaveBeenCalledWith({
      where: { externalEventId: event.id },
      data: { processedAt: expect.any(Date) },
    });
  });

  it('acknowledges a previously processed event without repeating order updates', async () => {
    const { service, transaction, orders, provider } = makeService();
    transaction.paymentWebhookEvent.findUniqueOrThrow.mockResolvedValue({
      processedAt: new Date(),
    });

    await expect(service.handle(Buffer.from('{}'), 'signature')).resolves.toEqual({
      received: true,
    });

    expect(transaction.payment.findFirst).not.toHaveBeenCalled();
    expect(orders.completePayment).not.toHaveBeenCalled();
    expect(provider.refundPaymentIntent).not.toHaveBeenCalled();
  });

  it('does not touch persistence when signature verification fails', async () => {
    const { service, prisma, provider } = makeService();
    provider.verifyWebhook.mockImplementation(() => {
      throw new Error('invalid signature');
    });

    await expect(service.handle(Buffer.from('{}'), 'bad')).rejects.toThrow(
      'invalid signature',
    );
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });
});
