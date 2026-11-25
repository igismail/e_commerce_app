import { createHash, randomBytes } from 'node:crypto';
import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  Prisma,
  ProductStatus,
} from '../generated/prisma/client';
import { PrismaService } from '../prisma.service';
import { quoteCoupon } from './coupon-pricing';
import { AddCartItemDto, ApplyCouponDto, UpdateCartItemDto } from './cart.dto';

const GUEST_TOKEN_PATTERN = /^[A-Za-z0-9_-]{43}$/;
const GUEST_CART_TTL_DAYS = 30;
const MAX_CART_ITEM_QUANTITY = 99;

const cartInclude = {
  items: {
    orderBy: { createdAt: 'asc' },
    include: {
      variant: {
        include: {
          inventory: { select: { quantity: true, reserved: true } },
          product: {
            include: {
              category: {
                select: { id: true, name: true, slug: true, deletedAt: true },
              },
              images: { orderBy: { sortOrder: 'asc' } },
            },
          },
        },
      },
    },
  },
} satisfies Prisma.CartInclude;

type CartWithItems = Prisma.CartGetPayload<{ include: typeof cartInclude }>;

interface CartIdentity {
  cartId: string;
  guestToken?: string;
}

interface CartResult {
  data: Awaited<ReturnType<CartService['presentCart']>>;
  guestToken?: string;
}

@Injectable()
export class CartService {
  constructor(private readonly prisma: PrismaService) {}

  async getCart(userId?: string, guestToken?: string): Promise<CartResult> {
    const identity = await this.ensureCart(userId, guestToken);
    return this.result(identity);
  }

  async addItem(
    userId: string | undefined,
    guestToken: string | undefined,
    input: AddCartItemDto,
  ): Promise<CartResult> {
    const identity = await this.ensureCart(userId, guestToken);
    await this.prisma.$transaction(async (transaction) => {
      await this.lockCart(transaction, identity.cartId);
      const available = await this.availableQuantity(
        transaction,
        input.variantId,
      );
      const unique = {
        cartId_variantId: {
          cartId: identity.cartId,
          variantId: input.variantId,
        },
      };
      const item = await transaction.cartItem.upsert({
        where: unique,
        create: {
          cartId: identity.cartId,
          variantId: input.variantId,
          quantity: input.quantity,
        },
        update: { quantity: { increment: input.quantity } },
      });
      if (item.quantity > MAX_CART_ITEM_QUANTITY) {
        throw new BadRequestException(
          `A cart item cannot exceed ${MAX_CART_ITEM_QUANTITY} units`,
        );
      }
      if (item.quantity > available) {
        throw new ConflictException('Requested quantity is not available');
      }
      await this.touchCart(transaction, identity.cartId);
    });
    return this.result(identity);
  }

  async updateItem(
    userId: string | undefined,
    guestToken: string | undefined,
    itemId: string,
    input: UpdateCartItemDto,
  ): Promise<CartResult> {
    const identity = await this.ensureCart(userId, guestToken);
    await this.prisma.$transaction(async (transaction) => {
      await this.lockCart(transaction, identity.cartId);
      const item = await transaction.cartItem.findFirst({
        where: { id: itemId, cartId: identity.cartId },
        select: { id: true, variantId: true },
      });
      if (!item) {
        throw new NotFoundException('Cart item not found');
      }
      await this.assertAvailable(transaction, item.variantId, input.quantity);
      await transaction.cartItem.update({
        where: { id: item.id },
        data: { quantity: input.quantity },
      });
      await this.touchCart(transaction, identity.cartId);
    });
    return this.result(identity);
  }

  async removeItem(
    userId: string | undefined,
    guestToken: string | undefined,
    itemId: string,
  ): Promise<CartResult> {
    const identity = await this.ensureCart(userId, guestToken);
    const removed = await this.prisma.$transaction(async (transaction) => {
      await this.lockCart(transaction, identity.cartId);
      const result = await transaction.cartItem.deleteMany({
        where: { id: itemId, cartId: identity.cartId },
      });
      if (result.count === 1) {
        await this.touchCart(transaction, identity.cartId);
      }
      return result;
    });
    if (removed.count !== 1) {
      throw new NotFoundException('Cart item not found');
    }
    return this.result(identity);
  }

  async applyCoupon(
    userId: string | undefined,
    guestToken: string | undefined,
    input: ApplyCouponDto,
  ): Promise<CartResult> {
    const identity = await this.ensureCart(userId, guestToken);
    await this.prisma.$transaction(async (transaction) => {
      await this.lockCart(transaction, identity.cartId);
      const cart = await transaction.cart.findUniqueOrThrow({
        where: { id: identity.cartId },
        include: cartInclude,
      });
      const subtotalAmount = this.subtotal(cart);
      if (subtotalAmount === 0) {
        throw new BadRequestException('Add an item before applying a coupon');
      }

      const coupon = await transaction.coupon.findUnique({
        where: { code: input.code },
      });
      const quote = quoteCoupon(coupon, subtotalAmount);
      if (!quote?.valid) {
        throw new BadRequestException(
          quote?.reason ?? 'Coupon is invalid or unavailable',
        );
      }
      await transaction.cart.update({
        where: { id: identity.cartId },
        data: {
          couponCode: quote.code,
          lastActivityAt: new Date(),
          abandonedReminderSentAt: null,
        },
      });
    });
    return this.result(identity);
  }

  async removeCoupon(
    userId: string | undefined,
    guestToken: string | undefined,
  ): Promise<CartResult> {
    const identity = await this.ensureCart(userId, guestToken);
    await this.prisma.$transaction(async (transaction) => {
      await this.lockCart(transaction, identity.cartId);
      await transaction.cart.update({
        where: { id: identity.cartId },
        data: {
          couponCode: null,
          lastActivityAt: new Date(),
          abandonedReminderSentAt: null,
        },
      });
    });
    return this.result(identity);
  }

  async mergeGuestCart(userId: string, rawGuestToken: string) {
    if (!GUEST_TOKEN_PATTERN.test(rawGuestToken)) {
      return;
    }
    const guestTokenHash = this.hashGuestToken(rawGuestToken);
    await this.prisma.$transaction(async (transaction) => {
      const lockedGuestCart = await transaction.$queryRaw<
        Array<{ id: string }>
      >`SELECT "id" FROM "Cart" WHERE "guestToken" = ${guestTokenHash} FOR UPDATE`;
      if (lockedGuestCart.length === 0) {
        return;
      }
      const guestCart = await transaction.cart.findUnique({
        where: { guestToken: guestTokenHash },
        include: { items: true },
      });
      if (!guestCart) {
        return;
      }
      if (!guestCart.expiresAt || guestCart.expiresAt <= new Date()) {
        await transaction.cart.delete({ where: { id: guestCart.id } });
        return;
      }

      const userCart = await transaction.cart.upsert({
        where: { userId },
        create: { userId },
        update: {},
      });
      await this.lockCart(transaction, userCart.id);
      for (const guestItem of guestCart.items) {
        const unique = {
          cartId_variantId: {
            cartId: userCart.id,
            variantId: guestItem.variantId,
          },
        };
        const existing = await transaction.cartItem.findUnique({
          where: unique,
        });
        const quantity = Math.min(
          MAX_CART_ITEM_QUANTITY,
          guestItem.quantity + (existing?.quantity ?? 0),
        );
        await transaction.cartItem.upsert({
          where: unique,
          create: {
            cartId: userCart.id,
            variantId: guestItem.variantId,
            quantity,
          },
          update: { quantity },
        });
      }
      if (!userCart.couponCode && guestCart.couponCode) {
        await transaction.cart.update({
          where: { id: userCart.id },
          data: {
            couponCode: guestCart.couponCode,
            lastActivityAt: new Date(),
            abandonedReminderSentAt: null,
          },
        });
      } else if (guestCart.items.length > 0) {
        await this.touchCart(transaction, userCart.id);
      }
      await transaction.cart.delete({ where: { id: guestCart.id } });
    });
  }

  private async ensureCart(
    userId?: string,
    rawGuestToken?: string,
  ): Promise<CartIdentity> {
    if (userId) {
      const cart = await this.prisma.cart.upsert({
        where: { userId },
        create: { userId },
        update: {},
        select: { id: true },
      });
      return { cartId: cart.id };
    }

    let guestToken =
      rawGuestToken && GUEST_TOKEN_PATTERN.test(rawGuestToken)
        ? rawGuestToken
        : randomBytes(32).toString('base64url');
    let guestTokenHash = this.hashGuestToken(guestToken);
    const existing = await this.prisma.cart.findUnique({
      where: { guestToken: guestTokenHash },
      select: { id: true, expiresAt: true },
    });
    if (existing && (!existing.expiresAt || existing.expiresAt <= new Date())) {
      await this.prisma.cart.deleteMany({
        where: {
          id: existing.id,
          guestToken: guestTokenHash,
          OR: [{ expiresAt: null }, { expiresAt: { lte: new Date() } }],
        },
      });
      guestToken = randomBytes(32).toString('base64url');
      guestTokenHash = this.hashGuestToken(guestToken);
    }
    const expiresAt = new Date(
      Date.now() + GUEST_CART_TTL_DAYS * 24 * 60 * 60 * 1000,
    );
    const cart = await this.prisma.cart.upsert({
      where: { guestToken: guestTokenHash },
      create: { guestToken: guestTokenHash, expiresAt },
      update: { expiresAt },
      select: { id: true },
    });
    return { cartId: cart.id, guestToken };
  }

  private async result(identity: CartIdentity): Promise<CartResult> {
    const cart = await this.loadCart(identity.cartId);
    return {
      data: await this.presentCart(cart),
      ...(identity.guestToken ? { guestToken: identity.guestToken } : {}),
    };
  }

  private loadCart(cartId: string) {
    return this.prisma.cart.findUniqueOrThrow({
      where: { id: cartId },
      include: cartInclude,
    });
  }

  private async presentCart(cart: CartWithItems) {
    const items = cart.items.map((item) => {
      const variant = item.variant;
      const available =
        (variant.inventory?.quantity ?? 0) -
        (variant.inventory?.reserved ?? 0);
      const lineTotalAmount = variant.priceAmount * item.quantity;
      const inStock =
        available >= item.quantity &&
        variant.isActive &&
        !variant.deletedAt &&
        variant.product.status === ProductStatus.ACTIVE &&
        !variant.product.deletedAt &&
        !variant.product.category.deletedAt;
      return {
        id: item.id,
        quantity: item.quantity,
        unitPriceAmount: variant.priceAmount,
        lineTotalAmount,
        variant: {
          id: variant.id,
          sku: variant.sku,
          name: variant.name,
          optionValues: variant.optionValues,
          priceAmount: variant.priceAmount,
          compareAtAmount: variant.compareAtAmount,
          inStock,
          product: {
            id: variant.product.id,
            name: variant.product.name,
            slug: variant.product.slug,
            brand: variant.product.brand,
            category: {
              id: variant.product.category.id,
              name: variant.product.category.name,
              slug: variant.product.category.slug,
            },
            images: variant.product.images,
          },
        },
      };
    });
    const subtotalAmount = this.subtotal(cart);
    let coupon: ReturnType<typeof quoteCoupon> = null;
    if (cart.couponCode) {
      const record = await this.prisma.coupon.findUnique({
        where: { code: cart.couponCode },
      });
      coupon = quoteCoupon(record, subtotalAmount) ?? {
        code: cart.couponCode,
        valid: false,
        discountAmount: 0,
        reason: 'Coupon is invalid or unavailable',
      };
    }
    const discountAmount = coupon?.valid ? coupon.discountAmount : 0;

    return {
      id: cart.id,
      items,
      coupon,
      subtotalAmount,
      discountAmount,
      totalAmount: subtotalAmount - discountAmount,
    };
  }

  private subtotal(cart: CartWithItems) {
    const subtotal = cart.items.reduce(
      (total, item) => total + item.variant.priceAmount * item.quantity,
      0,
    );
    if (!Number.isSafeInteger(subtotal)) {
      throw new BadRequestException('Cart total exceeds the supported range');
    }
    return subtotal;
  }

  private async assertAvailable(
    transaction: Prisma.TransactionClient,
    variantId: string,
    quantity: number,
  ) {
    const available = await this.availableQuantity(transaction, variantId);
    if (quantity > available) {
      throw new ConflictException('Requested quantity is not available');
    }
  }

  private async availableQuantity(
    transaction: Prisma.TransactionClient,
    variantId: string,
  ) {
    const variant = await transaction.productVariant.findFirst({
      where: {
        id: variantId,
        isActive: true,
        deletedAt: null,
        product: {
          status: ProductStatus.ACTIVE,
          deletedAt: null,
          category: { deletedAt: null },
        },
      },
      select: {
        id: true,
        inventory: { select: { quantity: true, reserved: true } },
      },
    });
    if (!variant) {
      throw new NotFoundException('Product variant not found');
    }
    return (
      (variant.inventory?.quantity ?? 0) - (variant.inventory?.reserved ?? 0)
    );
  }

  private async lockCart(
    transaction: Prisma.TransactionClient,
    cartId: string,
  ) {
    await transaction.$queryRaw<Array<{ id: string }>>`
      SELECT "id" FROM "Cart" WHERE "id" = ${cartId} FOR UPDATE
    `;
  }

  private touchCart(transaction: Prisma.TransactionClient, cartId: string) {
    return transaction.cart.update({
      where: { id: cartId },
      data: {
        lastActivityAt: new Date(),
        abandonedReminderSentAt: null,
      },
    });
  }

  private hashGuestToken(rawGuestToken: string) {
    return createHash('sha256').update(rawGuestToken).digest('hex');
  }
}
