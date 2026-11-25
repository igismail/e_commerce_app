import { createHash, randomBytes, randomUUID } from "node:crypto";
import {
  BadRequestException,
  ConflictException,
  Inject,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import {
  OrderStatus,
  PaymentProvider as PaymentProviderName,
  PaymentStatus,
  Prisma,
  ShippingMethod,
} from "../generated/prisma/client";
import { EmailService } from "../auth/email.service";
import { quoteCoupon } from "../cart/coupon-pricing";
import { PrismaService } from "../prisma.service";
import { CheckoutDto, OrdersQueryDto } from "./checkout.dto";
import {
  getCheckoutConfig,
  shippingAmount,
  taxAmount,
} from "./checkout.config";
import { OrderJobsService } from "./order-jobs.service";
import { PAYMENT_PROVIDER, PaymentProvider } from "./payment-provider";

const orderInclude = {
  items: { orderBy: { createdAt: "asc" } },
  payments: {
    orderBy: { createdAt: "desc" },
    take: 1,
  },
} satisfies Prisma.OrderInclude;

const checkoutCartInclude = {
  items: {
    orderBy: { createdAt: "asc" },
    include: {
      variant: {
        include: {
          inventory: true,
          product: { include: { category: true } },
        },
      },
    },
  },
} satisfies Prisma.CartInclude;

type OrderWithDetails = Prisma.OrderGetPayload<{
  include: typeof orderInclude;
}>;
type CheckoutResponse = {
  order: {
    id: string;
    orderNumber: string;
    status: OrderStatus;
    currency: string;
    shippingMethod: ShippingMethod;
    subtotalAmount: number;
    shippingAmount: number;
    taxAmount: number;
    discountAmount: number;
    totalAmount: number;
    reservationExpiresAt: string | null;
    items: Array<{
      sku: string;
      productName: string;
      variantName: string;
      unitPriceAmount: number;
      quantity: number;
      lineTotalAmount: number;
    }>;
  };
  payment: {
    id: string;
    provider: PaymentProviderName;
    clientSecret: string;
    amount: number;
    currency: string;
  };
};

const MAX_DATABASE_AMOUNT = 2_147_483_647;
const IDEMPOTENCY_KEY_PATTERN = /^[A-Za-z0-9._:-]{8,128}$/;

@Injectable()
export class OrdersService {
  constructor(
    private readonly prisma: PrismaService,
    @Inject(PAYMENT_PROVIDER)
    private readonly paymentProvider: PaymentProvider,
    private readonly jobs: OrderJobsService,
    private readonly email: EmailService,
  ) {}

  async createCheckout(
    userId: string,
    idempotencyKey: string | undefined,
    input: CheckoutDto,
  ): Promise<CheckoutResponse> {
    if (!idempotencyKey || !IDEMPOTENCY_KEY_PATTERN.test(idempotencyKey)) {
      throw new BadRequestException(
        "A valid Idempotency-Key header is required",
      );
    }

    const scope = `checkout:${userId}`;
    const requestHash = this.hashRequest(input);
    const prepared = await this.prepareCheckout(
      userId,
      scope,
      idempotencyKey,
      requestHash,
      input,
    );
    if (prepared.cachedResponse) {
      return this.readCheckoutResponse(prepared.cachedResponse);
    }

    const payment = await this.prisma.payment.findFirst({
      where: { id: prepared.paymentId },
      include: { order: { include: { items: true } } },
    });
    if (!payment) {
      throw new Error("Checkout idempotency record has no payment");
    }
    if (
      !payment.order.reservationExpiresAt &&
      payment.order.status === OrderStatus.PENDING
    ) {
      throw new ConflictException("This order is no longer awaiting payment");
    }

    const intent = await this.paymentProvider.createPaymentIntent({
      orderId: payment.order.id,
      paymentId: payment.id,
      amount: payment.amount,
      currency: payment.currency,
      customerEmail: (
        await this.prisma.user.findUniqueOrThrow({
          where: { id: userId },
          select: { email: true },
        })
      ).email,
      idempotencyKey: payment.idempotencyKey,
    });
    const response = this.checkoutResponse(
      payment.order,
      payment,
      intent.clientSecret,
    );

    await this.prisma.$transaction(async (transaction) => {
      await transaction.payment.update({
        where: { id: payment.id },
        data: { externalReference: intent.id },
      });
      await transaction.idempotencyKey.update({
        where: {
          scope_key: { scope, key: idempotencyKey },
        },
        data: {
          responseStatus: 201,
          responseBody: response as Prisma.InputJsonObject,
        },
      });
    });
    return response;
  }

  async listOrders(userId: string, query: OrdersQueryDto) {
    const where: Prisma.OrderWhereInput = {
      userId,
      ...(query.status ? { status: query.status } : {}),
    };
    const [total, records] = await this.prisma.$transaction([
      this.prisma.order.count({ where }),
      this.prisma.order.findMany({
        where,
        include: orderInclude,
        orderBy: { createdAt: "desc" },
        skip: (query.page - 1) * query.limit,
        take: query.limit,
      }),
    ]);

    return {
      data: records.map((order) => this.presentOrder(order)),
      pagination: {
        page: query.page,
        limit: query.limit,
        total,
        totalPages: Math.ceil(total / query.limit),
      },
    };
  }

  async getOrder(userId: string, orderId: string) {
    const order = await this.prisma.order.findFirst({
      where: { id: orderId, userId },
      include: orderInclude,
    });
    if (!order) {
      throw new NotFoundException("Order not found");
    }
    return this.presentOrder(order);
  }

  async cancelOrder(userId: string, orderId: string) {
    const order = await this.prisma.order.findFirst({
      where: { id: orderId, userId },
      include: {
        items: true,
        payments: { orderBy: { createdAt: "desc" }, take: 1 },
      },
    });
    if (!order) {
      throw new NotFoundException("Order not found");
    }
    if (
      order.status === OrderStatus.CANCELLED ||
      order.status === OrderStatus.REFUNDED
    ) {
      return this.presentOrder(order);
    }
    if (
      order.status === OrderStatus.SHIPPED ||
      order.status === OrderStatus.DELIVERED
    ) {
      throw new ConflictException("This order can no longer be cancelled");
    }

    const payment = order.payments[0];
    if (
      order.status === OrderStatus.PAID ||
      order.status === OrderStatus.PROCESSING
    ) {
      if (
        !payment?.externalReference ||
        payment.status !== PaymentStatus.SUCCEEDED
      ) {
        throw new ConflictException(
          "The payment is still processing; try cancelling again shortly",
        );
      }
      const refund = await this.paymentProvider.refundPaymentIntent(
        payment.externalReference,
        `order-refund:${payment.id}`,
      );
      if (refund.status === "succeeded") {
        await this.prisma.$transaction(async (transaction) => {
          await this.restockInventoryAfterRefund(transaction, orderId);
          await transaction.payment.update({
            where: { id: payment.id },
            data: { status: PaymentStatus.REFUNDED },
          });
          await transaction.order.update({
            where: { id: orderId },
            data: { status: OrderStatus.REFUNDED },
          });
        });
      }
      return this.getOrder(userId, orderId);
    }

    let providerStatus: string | undefined;
    if (payment?.externalReference) {
      providerStatus = (
        await this.paymentProvider.cancelPaymentIntent(
          payment.externalReference,
          `order-cancel:${payment.id}`,
        )
      ).status;
    }

    if (providerStatus === "succeeded") {
      if (!payment?.externalReference) {
        throw new Error("Succeeded payment is missing its provider reference");
      }
      const refund = await this.paymentProvider.refundPaymentIntent(
        payment.externalReference,
        `order-refund:${payment.id}`,
      );
      if (refund.status === "succeeded") {
        await this.prisma.$transaction(async (transaction) => {
          await transaction.payment.update({
            where: { id: payment.id },
            data: { status: PaymentStatus.REFUNDED },
          });
          await transaction.order.update({
            where: { id: orderId },
            data: { status: OrderStatus.REFUNDED },
          });
        });
      }
      return this.getOrder(userId, orderId);
    }
    if (providerStatus === "processing") {
      throw new ConflictException(
        "The payment is still processing; try cancelling again shortly",
      );
    }

    await this.prisma.$transaction(async (transaction) => {
      await transaction.$queryRaw<Array<{ id: string }>>`
        SELECT "id" FROM "Order" WHERE "id" = ${orderId} AND "userId" = ${userId} FOR UPDATE
      `;
      const current = await transaction.order.findFirst({
        where: { id: orderId, userId },
        include: { items: true },
      });
      if (!current) {
        throw new NotFoundException("Order not found");
      }
      if (current.status !== OrderStatus.PENDING) {
        throw new ConflictException("This order can no longer be cancelled");
      }
      await this.releaseReservations(transaction, current.items);
      if (current.couponId) {
        await transaction.coupon.updateMany({
          where: { id: current.couponId, usesCount: { gt: 0 } },
          data: { usesCount: { decrement: 1 } },
        });
      }
      await transaction.payment.updateMany({
        where: {
          orderId,
          status: { not: PaymentStatus.SUCCEEDED },
        },
        data: { status: PaymentStatus.CANCELLED },
      });
      await transaction.order.update({
        where: { id: orderId },
        data: {
          status: OrderStatus.CANCELLED,
          reservationExpiresAt: null,
        },
      });
    });
    return this.getOrder(userId, orderId);
  }

  async expirePendingOrders() {
    const expired = await this.prisma.order.findMany({
      where: {
        status: OrderStatus.PENDING,
        reservationExpiresAt: { lte: new Date() },
      },
      select: {
        id: true,
        payments: {
          where: { externalReference: { not: null } },
          orderBy: { createdAt: "desc" },
          take: 1,
          select: { id: true, externalReference: true },
        },
      },
      take: 100,
    });

    for (const order of expired) {
      const payment = order.payments[0];
      if (payment?.externalReference) {
        const status = (
          await this.paymentProvider.cancelPaymentIntent(
            payment.externalReference,
            `payment-expire:${payment.id}`,
          )
        ).status;
        if (status === "processing") {
          continue;
        }
        if (status === "succeeded") {
          const completed = await this.prisma.$transaction((transaction) =>
            this.completePayment(transaction, payment.id),
          );
          if (completed.orderId) {
            await this.jobs.enqueueOrderConfirmation(completed.orderId);
            await this.enqueueLowStockAlerts(completed.orderId);
          }
          continue;
        }
      }
      await this.cancelExpiredOrder(order.id);
    }

    await this.prisma.idempotencyKey.deleteMany({
      where: {
        expiresAt: { lt: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000) },
      },
    });
  }

  async sendAbandonedCartReminder(cartId: string, lastActivityAt: Date) {
    const cutoff = new Date(
      Date.now() - getCheckoutConfig().abandonedCartHours * 60 * 60 * 1000,
    );
    const cart = await this.prisma.cart.findFirst({
      where: {
        id: cartId,
        userId: { not: null },
        lastActivityAt,
        abandonedReminderSentAt: null,
        items: { some: {} },
        user: { isActive: true, emailVerifiedAt: { not: null } },
      },
      include: {
        user: { select: { email: true, firstName: true } },
        items: {
          include: {
            variant: {
              include: { product: { select: { name: true } } },
            },
          },
        },
      },
    });
    if (!cart?.user || cart.lastActivityAt > cutoff) {
      return;
    }
    await this.email.sendAbandonedCartReminder(
      cart.user.email,
      cart.user.firstName,
      cart.items.map((item) => item.variant.product.name),
    );
    await this.prisma.cart.updateMany({
      where: {
        id: cart.id,
        lastActivityAt,
        abandonedReminderSentAt: null,
      },
      data: { abandonedReminderSentAt: new Date() },
    });
  }

  async enqueueAbandonedCartReminders() {
    const config = getCheckoutConfig();
    const cutoff = new Date(
      Date.now() - config.abandonedCartHours * 60 * 60 * 1000,
    );
    const carts = await this.prisma.cart.findMany({
      where: {
        userId: { not: null },
        lastActivityAt: { lte: cutoff },
        abandonedReminderSentAt: null,
        items: { some: {} },
        user: { isActive: true, emailVerifiedAt: { not: null } },
      },
      select: { id: true, lastActivityAt: true },
      take: 100,
    });
    for (const cart of carts) {
      await this.jobs.enqueueAbandonedCartReminder(
        cart.id,
        cart.lastActivityAt,
      );
    }
  }

  async sendLowStockAlert(variantId: string) {
    const config = getCheckoutConfig();
    if (!config.lowStockAlertEmail) {
      return;
    }
    const inventory = await this.prisma.inventory.findUnique({
      where: { variantId },
      include: {
        variant: {
          include: { product: { select: { name: true } } },
        },
      },
    });
    if (
      !inventory ||
      inventory.quantity - inventory.reserved > config.lowStockThreshold ||
      inventory.lowStockAlertedAt
    ) {
      return;
    }
    await this.email.sendLowStockAlert({
      to: config.lowStockAlertEmail,
      productName: inventory.variant.product.name,
      sku: inventory.variant.sku,
      available: inventory.quantity - inventory.reserved,
    });
    await this.prisma.inventory.updateMany({
      where: { id: inventory.id, lowStockAlertedAt: null },
      data: { lowStockAlertedAt: new Date() },
    });
  }

  async completePayment(
    transaction: Prisma.TransactionClient,
    paymentId: string,
  ) {
    const payment = await transaction.payment.findUnique({
      where: { id: paymentId },
      include: { order: { include: { items: true } } },
    });
    if (!payment) {
      return { orderId: undefined, latePayment: false };
    }
    await transaction.$queryRaw<Array<{ id: string }>>`
      SELECT "id" FROM "Order" WHERE "id" = ${payment.orderId} FOR UPDATE
    `;
    const order = await transaction.order.findUniqueOrThrow({
      where: { id: payment.orderId },
      include: { items: true },
    });
    if (order.status === OrderStatus.CANCELLED) {
      await transaction.payment.update({
        where: { id: paymentId },
        data: { status: PaymentStatus.SUCCEEDED },
      });
      return { orderId: order.id, latePayment: true };
    }
    if (order.status !== OrderStatus.PENDING) {
      return { orderId: order.id, latePayment: false };
    }

    for (const item of order.items) {
      if (!item.variantId) {
        throw new ConflictException(
          "An ordered product is no longer available",
        );
      }
      const updated = await transaction.$queryRaw<Array<{ id: string }>>`
        UPDATE "Inventory"
        SET "quantity" = "quantity" - ${item.quantity},
            "reserved" = "reserved" - ${item.quantity},
            "updatedAt" = CURRENT_TIMESTAMP
        WHERE "variantId" = ${item.variantId}
          AND "quantity" >= ${item.quantity}
          AND "reserved" >= ${item.quantity}
        RETURNING "id"
      `;
      if (updated.length !== 1) {
        throw new ConflictException(
          "Reserved inventory could not be committed",
        );
      }
    }
    await transaction.payment.update({
      where: { id: paymentId },
      data: { status: PaymentStatus.SUCCEEDED },
    });
    await transaction.order.update({
      where: { id: order.id },
      data: {
        status: OrderStatus.PAID,
        reservationExpiresAt: null,
      },
    });
    return { orderId: order.id, latePayment: false };
  }

  async notifyPaymentSucceeded(orderId: string) {
    await this.jobs.enqueueOrderConfirmation(orderId);
    await this.enqueueLowStockAlerts(orderId);
  }

  async restockInventoryAfterRefund(
    transaction: Prisma.TransactionClient,
    orderId: string,
  ) {
    await transaction.$queryRaw<Array<{ id: string }>>`
      SELECT "id" FROM "Order" WHERE "id" = ${orderId} FOR UPDATE
    `;
    const order = await transaction.order.findUnique({
      where: { id: orderId },
      include: { items: true },
    });
    if (
      !order ||
      order.inventoryRestockedAt ||
      ![OrderStatus.PAID, OrderStatus.PROCESSING].includes(order.status)
    ) {
      return;
    }

    for (const item of order.items) {
      if (item.variantId) {
        await transaction.inventory.updateMany({
          where: { variantId: item.variantId },
          data: {
            quantity: { increment: item.quantity },
            lowStockAlertedAt: null,
          },
        });
      }
    }
    await transaction.order.update({
      where: { id: order.id },
      data: { inventoryRestockedAt: new Date() },
    });
  }

  async cancelPendingOrder(
    transaction: Prisma.TransactionClient,
    orderId: string,
  ) {
    await transaction.$queryRaw<Array<{ id: string }>>`
      SELECT "id" FROM "Order" WHERE "id" = ${orderId} FOR UPDATE
    `;
    const order = await transaction.order.findUnique({
      where: { id: orderId },
      include: { items: true },
    });
    if (!order || order.status !== OrderStatus.PENDING) {
      return false;
    }
    await this.releaseReservations(transaction, order.items);
    if (order.couponId) {
      await transaction.coupon.updateMany({
        where: { id: order.couponId, usesCount: { gt: 0 } },
        data: { usesCount: { decrement: 1 } },
      });
    }
    await transaction.payment.updateMany({
      where: {
        orderId,
        status: { not: PaymentStatus.SUCCEEDED },
      },
      data: { status: PaymentStatus.CANCELLED },
    });
    await transaction.order.update({
      where: { id: orderId },
      data: {
        status: OrderStatus.CANCELLED,
        reservationExpiresAt: null,
      },
    });
    return true;
  }

  private async prepareCheckout(
    userId: string,
    scope: string,
    key: string,
    requestHash: string,
    input: CheckoutDto,
  ) {
    try {
      return await this.prisma.$transaction(async (transaction) => {
        const existing = await transaction.idempotencyKey.findUnique({
          where: { scope_key: { scope, key } },
        });
        if (existing) {
          if (existing.expiresAt <= new Date()) {
            throw new ConflictException(
              "Idempotency key expired; submit a new key",
            );
          }
          if (existing.requestHash !== requestHash) {
            throw new ConflictException(
              "Idempotency key was already used for a different checkout",
            );
          }
          if (existing.responseBody) {
            return { cachedResponse: existing.responseBody };
          }
          if (!existing.resourceId) {
            throw new ConflictException("Checkout request is still processing");
          }
          const payment = await transaction.payment.findFirst({
            where: { orderId: existing.resourceId },
            select: { id: true },
          });
          if (!payment) {
            throw new Error("Checkout idempotency record has no payment");
          }
          return {
            paymentId: payment.id,
            orderId: existing.resourceId,
          };
        }

        const idempotency = await transaction.idempotencyKey.create({
          data: {
            scope,
            key,
            requestHash,
            responseStatus: 201,
            expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000),
          },
        });
        await transaction.$queryRaw<Array<{ id: string }>>`
          SELECT "id" FROM "Cart" WHERE "userId" = ${userId} FOR UPDATE
        `;
        const cart = await transaction.cart.findUnique({
          where: { userId },
          include: checkoutCartInclude,
        });
        if (!cart || cart.items.length === 0) {
          throw new BadRequestException("Your cart is empty");
        }

        let subtotalAmount = 0;
        for (const item of cart.items) {
          const variant = item.variant;
          if (
            !variant.isActive ||
            variant.deletedAt ||
            variant.product.status !== "ACTIVE" ||
            variant.product.deletedAt ||
            variant.product.category.deletedAt ||
            !variant.inventory
          ) {
            throw new ConflictException(
              "Your cart contains an item that is no longer available",
            );
          }
          subtotalAmount += variant.priceAmount * item.quantity;
          if (!Number.isSafeInteger(subtotalAmount)) {
            throw new BadRequestException(
              "Cart total exceeds the supported range",
            );
          }
        }
        this.assertDatabaseAmount(subtotalAmount);

        let couponId: string | null = null;
        let discountAmount = 0;
        if (cart.couponCode) {
          await transaction.$queryRaw<Array<{ id: string }>>`
            SELECT "id" FROM "Coupon" WHERE "code" = ${cart.couponCode} FOR UPDATE
          `;
          const coupon = await transaction.coupon.findUnique({
            where: { code: cart.couponCode },
          });
          const quote = quoteCoupon(coupon, subtotalAmount);
          if (!quote?.valid || !coupon) {
            throw new BadRequestException(
              quote?.reason ?? "Cart coupon is no longer valid",
            );
          }
          couponId = coupon.id;
          discountAmount = quote.discountAmount;
        }

        const config = getCheckoutConfig();
        const shipping = shippingAmount(input.shippingMethod);
        const tax = taxAmount(
          subtotalAmount - discountAmount,
          config.taxRateBasisPoints,
        );
        const totalAmount = subtotalAmount - discountAmount + shipping + tax;
        this.assertDatabaseAmount(totalAmount);
        if (totalAmount < 50) {
          throw new BadRequestException(
            "The payment total must be at least 50 cents",
          );
        }

        for (const item of cart.items) {
          const reserved = await transaction.$queryRaw<Array<{ id: string }>>`
            UPDATE "Inventory"
            SET "reserved" = "reserved" + ${item.quantity},
                "lowStockAlertedAt" = NULL,
                "updatedAt" = CURRENT_TIMESTAMP
            WHERE "variantId" = ${item.variantId}
              AND "quantity" - "reserved" >= ${item.quantity}
            RETURNING "id"
          `;
          if (reserved.length !== 1) {
            throw new ConflictException(
              "Requested quantity is no longer available",
            );
          }
        }

        if (couponId) {
          await transaction.coupon.update({
            where: { id: couponId },
            data: { usesCount: { increment: 1 } },
          });
        }
        const reservationExpiresAt = new Date(
          Date.now() + config.reservationMinutes * 60 * 1000,
        );
        const order = await transaction.order.create({
          data: {
            orderNumber: this.orderNumber(),
            userId,
            couponId,
            status: OrderStatus.PENDING,
            currency: config.currency,
            shippingMethod: input.shippingMethod,
            subtotalAmount,
            shippingAmount: shipping,
            taxAmount: tax,
            discountAmount,
            totalAmount,
            shippingAddress: this.addressJson(input.shippingAddress),
            ...(input.billingAddress
              ? { billingAddress: this.addressJson(input.billingAddress) }
              : {}),
            customerNote: input.customerNote ?? null,
            reservationExpiresAt,
            items: {
              create: cart.items.map((item) => ({
                productId: item.variant.product.id,
                variantId: item.variant.id,
                sku: item.variant.sku,
                productName: item.variant.product.name,
                variantName: item.variant.name,
                unitPriceAmount: item.variant.priceAmount,
                quantity: item.quantity,
                lineTotalAmount: item.variant.priceAmount * item.quantity,
              })),
            },
          },
          include: { items: true },
        });
        const payment = await transaction.payment.create({
          data: {
            orderId: order.id,
            provider: PaymentProviderName.STRIPE,
            status: PaymentStatus.REQUIRES_PAYMENT_METHOD,
            amount: totalAmount,
            currency: config.currency,
            idempotencyKey: `payment:${randomUUID()}`,
          },
        });
        await transaction.idempotencyKey.update({
          where: { id: idempotency.id },
          data: { resourceId: order.id },
        });
        await transaction.cartItem.deleteMany({ where: { cartId: cart.id } });
        await transaction.cart.update({
          where: { id: cart.id },
          data: {
            couponCode: null,
            lastActivityAt: new Date(),
            abandonedReminderSentAt: null,
          },
        });

        return { orderId: order.id, paymentId: payment.id };
      });
    } catch (error) {
      if (
        !(error instanceof Prisma.PrismaClientKnownRequestError) ||
        error.code !== "P2002"
      ) {
        throw error;
      }
      const existing = await this.prisma.idempotencyKey.findUnique({
        where: { scope_key: { scope, key } },
      });
      if (!existing) {
        throw error;
      }
      if (existing.requestHash !== requestHash) {
        throw new ConflictException(
          "Idempotency key was already used for a different checkout",
        );
      }
      if (existing.expiresAt <= new Date()) {
        throw new ConflictException(
          "Idempotency key expired; submit a new key",
        );
      }
      if (existing.responseBody) {
        return { cachedResponse: existing.responseBody };
      }
      if (!existing.resourceId) {
        throw new ConflictException("Checkout request is still processing");
      }
      const payment = await this.prisma.payment.findFirst({
        where: { orderId: existing.resourceId },
        select: { id: true },
      });
      if (!payment) {
        throw new Error("Checkout idempotency record has no payment");
      }
      return { paymentId: payment.id, orderId: existing.resourceId };
    }
  }

  private async cancelExpiredOrder(orderId: string) {
    await this.prisma.$transaction(async (transaction) => {
      const order = await transaction.order.findUnique({
        where: { id: orderId },
        include: { items: true },
      });
      if (
        !order ||
        order.status !== OrderStatus.PENDING ||
        !order.reservationExpiresAt ||
        order.reservationExpiresAt > new Date()
      ) {
        return;
      }
      await this.cancelPendingOrder(transaction, orderId);
    });
  }

  private async enqueueLowStockAlerts(orderId: string) {
    const order = await this.prisma.order.findUnique({
      where: { id: orderId },
      select: { items: { select: { variantId: true } } },
    });
    for (const item of order?.items ?? []) {
      if (item.variantId) {
        await this.jobs.enqueueLowStockAlert(item.variantId);
      }
    }
  }

  private async releaseReservations(
    transaction: Prisma.TransactionClient,
    items: Array<{ variantId: string | null; quantity: number }>,
  ) {
    for (const item of items) {
      if (!item.variantId) {
        throw new ConflictException(
          "An ordered product is no longer available",
        );
      }
      const released = await transaction.$queryRaw<Array<{ id: string }>>`
        UPDATE "Inventory"
        SET "reserved" = "reserved" - ${item.quantity},
            "lowStockAlertedAt" = NULL,
            "updatedAt" = CURRENT_TIMESTAMP
        WHERE "variantId" = ${item.variantId}
          AND "reserved" >= ${item.quantity}
        RETURNING "id"
      `;
      if (released.length !== 1) {
        throw new ConflictException("Reserved inventory could not be released");
      }
    }
  }

  private checkoutResponse(
    order: {
      id: string;
      orderNumber: string;
      status: OrderStatus;
      currency: string;
      shippingMethod: ShippingMethod;
      subtotalAmount: number;
      shippingAmount: number;
      taxAmount: number;
      discountAmount: number;
      totalAmount: number;
      reservationExpiresAt: Date | null;
      items: Array<{
        sku: string;
        productName: string;
        variantName: string;
        unitPriceAmount: number;
        quantity: number;
        lineTotalAmount: number;
      }>;
    },
    payment: {
      id: string;
      provider: PaymentProviderName;
      amount: number;
      currency: string;
    },
    clientSecret: string,
  ): CheckoutResponse {
    if (!order.reservationExpiresAt && order.status === OrderStatus.PENDING) {
      throw new ConflictException("This order is no longer awaiting payment");
    }
    return {
      order: {
        id: order.id,
        orderNumber: order.orderNumber,
        status: order.status,
        currency: order.currency,
        shippingMethod: order.shippingMethod,
        subtotalAmount: order.subtotalAmount,
        shippingAmount: order.shippingAmount,
        taxAmount: order.taxAmount,
        discountAmount: order.discountAmount,
        totalAmount: order.totalAmount,
        reservationExpiresAt: order.reservationExpiresAt?.toISOString() ?? null,
        items: order.items.map((item) => ({
          sku: item.sku,
          productName: item.productName,
          variantName: item.variantName,
          unitPriceAmount: item.unitPriceAmount,
          quantity: item.quantity,
          lineTotalAmount: item.lineTotalAmount,
        })),
      },
      payment: {
        id: payment.id,
        provider: payment.provider,
        clientSecret,
        amount: payment.amount,
        currency: payment.currency,
      },
    };
  }

  private readCheckoutResponse(value: Prisma.JsonValue): CheckoutResponse {
    if (
      typeof value !== "object" ||
      value === null ||
      Array.isArray(value) ||
      !("order" in value) ||
      !("payment" in value)
    ) {
      throw new Error("Stored checkout response is invalid");
    }
    return value as CheckoutResponse;
  }

  private presentOrder(order: OrderWithDetails) {
    return {
      id: order.id,
      orderNumber: order.orderNumber,
      status: order.status,
      currency: order.currency,
      shippingMethod: order.shippingMethod,
      subtotalAmount: order.subtotalAmount,
      shippingAmount: order.shippingAmount,
      taxAmount: order.taxAmount,
      discountAmount: order.discountAmount,
      totalAmount: order.totalAmount,
      shippingAddress: order.shippingAddress,
      billingAddress: order.billingAddress,
      customerNote: order.customerNote,
      createdAt: order.createdAt,
      updatedAt: order.updatedAt,
      items: order.items.map((item) => ({
        id: item.id,
        sku: item.sku,
        productName: item.productName,
        variantName: item.variantName,
        unitPriceAmount: item.unitPriceAmount,
        quantity: item.quantity,
        lineTotalAmount: item.lineTotalAmount,
      })),
      payments: order.payments.map((payment) => ({
        provider: payment.provider,
        status: payment.status,
        amount: payment.amount,
        currency: payment.currency,
        createdAt: payment.createdAt,
      })),
    };
  }

  private addressJson(address: CheckoutDto["shippingAddress"]) {
    return {
      fullName: address.fullName,
      ...(address.phone ? { phone: address.phone } : {}),
      line1: address.line1,
      ...(address.line2 ? { line2: address.line2 } : {}),
      city: address.city,
      region: address.region,
      postalCode: address.postalCode,
      countryCode: address.countryCode,
    } satisfies Prisma.InputJsonObject;
  }

  private hashRequest(input: CheckoutDto) {
    return createHash("sha256")
      .update(JSON.stringify(this.canonicalize(input)))
      .digest("hex");
  }

  private canonicalize(value: unknown): unknown {
    if (Array.isArray(value)) {
      return value.map((item) => this.canonicalize(item));
    }
    if (typeof value !== "object" || value === null) {
      return value;
    }
    return Object.fromEntries(
      Object.entries(value)
        .sort(([left], [right]) => left.localeCompare(right))
        .map(([key, item]) => [key, this.canonicalize(item)]),
    );
  }

  private assertDatabaseAmount(amount: number) {
    if (!Number.isSafeInteger(amount) || amount > MAX_DATABASE_AMOUNT) {
      throw new BadRequestException("Order total exceeds the supported range");
    }
  }

  private orderNumber() {
    const date = new Date().toISOString().slice(0, 10).replaceAll("-", "");
    return `COM-${date}-${randomBytes(6).toString("hex").toUpperCase()}`;
  }
}
