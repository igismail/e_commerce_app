import {
  BadRequestException,
  ConflictException,
  NotFoundException,
} from '@nestjs/common';
import { OrdersService } from '../dist/orders/orders.service';
import { CheckoutDto } from '../dist/orders/checkout.dto';
import {
  OrderStatus,
  PaymentProvider,
  PaymentStatus,
  ProductStatus,
  ShippingMethod,
} from '../dist/generated/prisma/client';

describe('OrdersService', () => {
  const checkout: CheckoutDto = {
    shippingAddress: {
      fullName: 'Alex Morgan',
      line1: '10 Market Street',
      city: 'Portland',
      region: 'Oregon',
      postalCode: '97205',
      countryCode: 'US',
    },
    shippingMethod: ShippingMethod.STANDARD,
  };

  function makeService() {
    const now = new Date();
    const product = {
      id: 'product-1',
      name: 'Ceramic Mug',
      status: ProductStatus.ACTIVE,
      deletedAt: null,
      category: { deletedAt: null },
    };
    const variant = {
      id: 'variant-1',
      sku: 'MUG-1',
      name: 'Blue',
      priceAmount: 2500,
      isActive: true,
      deletedAt: null,
      inventory: { quantity: 5, reserved: 0 },
      product,
    };
    const cart = {
      id: 'cart-1',
      couponCode: null,
      items: [
        {
          id: 'cart-item-1',
          variantId: variant.id,
          quantity: 1,
          variant,
        },
      ],
    };
    const order = {
      id: 'order-1',
      orderNumber: 'COM-20261126-ABCD12345678',
      status: OrderStatus.PENDING,
      currency: 'USD',
      shippingMethod: ShippingMethod.STANDARD,
      subtotalAmount: 2500,
      shippingAmount: 599,
      taxAmount: 206,
      discountAmount: 0,
      totalAmount: 3305,
      shippingAddress: checkout.shippingAddress,
      billingAddress: null,
      customerNote: null,
      reservationExpiresAt: new Date(now.getTime() + 30 * 60 * 1000),
      createdAt: now,
      updatedAt: now,
      items: [
        {
          id: 'order-item-1',
          sku: variant.sku,
          productName: product.name,
          variantName: variant.name,
          unitPriceAmount: variant.priceAmount,
          quantity: 1,
          lineTotalAmount: variant.priceAmount,
          variantId: variant.id,
        },
      ],
    };
    const payment = {
      id: 'payment-1',
      orderId: order.id,
      provider: PaymentProvider.STRIPE,
      status: PaymentStatus.REQUIRES_PAYMENT_METHOD,
      amount: order.totalAmount,
      currency: order.currency,
      idempotencyKey: 'payment:stable-key',
      externalReference: null,
      order,
    };
    const transaction = {
      $queryRaw: jest.fn().mockResolvedValue([{ id: 'row-1' }]),
      idempotencyKey: {
        findUnique: jest.fn().mockResolvedValue(null),
        create: jest.fn().mockResolvedValue({ id: 'idempotency-1' }),
        update: jest.fn().mockResolvedValue(undefined),
      },
      cart: {
        findUnique: jest.fn().mockResolvedValue(cart),
        update: jest.fn().mockResolvedValue(undefined),
      },
      cartItem: { deleteMany: jest.fn().mockResolvedValue({ count: 1 }) },
      coupon: {
        findUnique: jest.fn(),
        update: jest.fn(),
        updateMany: jest.fn(),
      },
      order: {
        create: jest.fn().mockResolvedValue(order),
        findFirst: jest.fn(),
        findUnique: jest.fn(),
        findUniqueOrThrow: jest.fn(),
        update: jest.fn(),
      },
      payment: {
        create: jest.fn().mockResolvedValue(payment),
        findFirst: jest.fn(),
        findUnique: jest.fn(),
        update: jest.fn().mockResolvedValue(undefined),
        updateMany: jest.fn(),
      },
    };
    const prisma = {
      $transaction: jest.fn((callback) => callback(transaction)),
      payment: { findFirst: jest.fn().mockResolvedValue(payment) },
      user: {
        findUniqueOrThrow: jest
          .fn()
          .mockResolvedValue({ email: 'alex@example.com' }),
      },
      idempotencyKey: { findUnique: jest.fn() },
      order: {
        findFirst: jest.fn(),
        count: jest.fn(),
        findMany: jest.fn(),
        findUnique: jest.fn(),
      },
      cart: { findMany: jest.fn(), findFirst: jest.fn() },
      inventory: { findUnique: jest.fn(), updateMany: jest.fn() },
    };
    const paymentProvider = {
      createPaymentIntent: jest.fn().mockResolvedValue({
        id: 'pi_test',
        clientSecret: 'pi_test_secret',
      }),
      cancelPaymentIntent: jest.fn(),
      refundPaymentIntent: jest.fn(),
      verifyWebhook: jest.fn(),
    };
    const jobs = {
      enqueueOrderConfirmation: jest.fn(),
      enqueueLowStockAlert: jest.fn(),
      enqueueAbandonedCartReminder: jest.fn(),
    };
    const email = {
      sendAbandonedCartReminder: jest.fn(),
      sendLowStockAlert: jest.fn(),
    };

    return {
      service: new OrdersService(
        prisma as never,
        paymentProvider as never,
        jobs as never,
        email as never,
      ),
      prisma,
      transaction,
      order,
      payment,
      paymentProvider,
      jobs,
    };
  }

  it('creates a price-snapshotted order and reserves stock within the transaction', async () => {
    const { service, transaction, prisma, paymentProvider, order } =
      makeService();

    const previousTaxRate = process.env.TAX_RATE_BPS;
    process.env.TAX_RATE_BPS = '825';
    let result: Awaited<ReturnType<OrdersService['createCheckout']>>;
    try {
      result = await service.createCheckout(
        'user-1',
        'checkout-key-1',
        checkout,
      );
    } finally {
      if (previousTaxRate === undefined) {
        delete process.env.TAX_RATE_BPS;
      } else {
        process.env.TAX_RATE_BPS = previousTaxRate;
      }
    }

    expect(transaction.$queryRaw).toHaveBeenCalledTimes(2);
    expect(transaction.order.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          subtotalAmount: 2500,
          shippingAmount: 599,
          taxAmount: 206,
          totalAmount: 3305,
          items: {
            create: [
              expect.objectContaining({
                sku: 'MUG-1',
                unitPriceAmount: 2500,
                lineTotalAmount: 2500,
              }),
            ],
          },
        }),
      }),
    );
    expect(transaction.idempotencyKey.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          scope: 'checkout:user-1',
          key: 'checkout-key-1',
          requestHash: expect.stringMatching(/^[a-f0-9]{64}$/),
        }),
      }),
    );
    expect(paymentProvider.createPaymentIntent).toHaveBeenCalledWith(
      expect.objectContaining({
        orderId: 'order-1',
        amount: 3305,
        currency: 'USD',
        customerEmail: 'alex@example.com',
      }),
    );
    expect(prisma.payment.findFirst).toHaveBeenCalled();
    expect(result.order).toMatchObject({
      id: order.id,
      totalAmount: 3305,
      reservationExpiresAt: expect.any(String),
    });
    expect(result.payment.clientSecret).toBe('pi_test_secret');
  });

  it('replays a completed idempotent checkout without creating another order or payment', async () => {
    const { service, transaction, paymentProvider } = makeService();
    const response = await service.createCheckout(
      'user-1',
      'checkout-key-1',
      checkout,
    );
    const requestHash =
      transaction.idempotencyKey.create.mock.calls[0][0].data.requestHash;
    transaction.idempotencyKey.findUnique.mockResolvedValue({
      expiresAt: new Date(Date.now() + 60_000),
      requestHash,
      responseBody: response,
      resourceId: response.order.id,
    });

    const result = await service.createCheckout(
      'user-1',
      'checkout-key-1',
      checkout,
    );

    expect(result).toEqual(response);
    expect(transaction.order.create).toHaveBeenCalledTimes(1);
    expect(paymentProvider.createPaymentIntent).toHaveBeenCalledTimes(1);
  });

  it('rejects an invalid idempotency key before touching the cart', async () => {
    const { service, prisma } = makeService();

    await expect(service.createCheckout('user-1', 'bad', checkout)).rejects.toBeInstanceOf(
      BadRequestException,
    );
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it('rolls back checkout when inventory cannot be reserved', async () => {
    const { service, transaction } = makeService();
    transaction.$queryRaw
      .mockResolvedValueOnce([{ id: 'cart-1' }])
      .mockResolvedValueOnce([]);

    await expect(
      service.createCheckout('user-1', 'checkout-key-1', checkout),
    ).rejects.toBeInstanceOf(ConflictException);
    expect(transaction.order.create).not.toHaveBeenCalled();
    expect(transaction.idempotencyKey.update).not.toHaveBeenCalled();
  });

  it('does not return an order that belongs to another customer', async () => {
    const { service, prisma } = makeService();
    prisma.order.findFirst.mockResolvedValue(null);

    await expect(service.getOrder('user-1', 'foreign-order')).rejects.toBeInstanceOf(
      NotFoundException,
    );
    expect(prisma.order.findFirst).toHaveBeenCalledWith({
      where: { id: 'foreign-order', userId: 'user-1' },
      include: expect.any(Object),
    });
  });
});
