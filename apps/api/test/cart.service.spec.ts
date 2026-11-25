import { BadRequestException, ConflictException, NotFoundException } from '@nestjs/common';
import { createHash } from 'node:crypto';
import { CartService } from '../dist/cart/cart.service';

describe('CartService', () => {
  function makeService() {
    const category = {
      id: 'category-1',
      name: 'Home',
      slug: 'home',
      deletedAt: null,
    };
    const product = {
      id: 'product-1',
      name: 'Ceramic Mug',
      slug: 'ceramic-mug',
      brand: 'Studio',
      status: 'ACTIVE',
      deletedAt: null,
      category,
      images: [],
    };
    const variant = {
      id: 'variant-1',
      sku: 'MUG-1',
      name: 'Blue',
      optionValues: { color: 'blue' },
      priceAmount: 1250,
      compareAtAmount: null,
      isActive: true,
      deletedAt: null,
      inventory: { quantity: 10, reserved: 2 },
      product,
    };
    const cartRecord = {
      id: 'cart-1',
      userId: null,
      guestToken: null,
      couponCode: null,
      expiresAt: null,
      createdAt: new Date(),
      updatedAt: new Date(),
      items: [
        {
          id: 'item-1',
          cartId: 'cart-1',
          variantId: variant.id,
          quantity: 2,
          createdAt: new Date(),
          updatedAt: new Date(),
          variant,
        },
      ],
    };
    const transaction = {
      $queryRaw: jest.fn().mockResolvedValue([{ id: 'cart-1' }]),
      cart: {
        findUnique: jest.fn(),
        findUniqueOrThrow: jest.fn().mockResolvedValue(cartRecord),
        upsert: jest.fn().mockResolvedValue({
          id: 'user-cart',
          couponCode: null,
        }),
        update: jest.fn().mockResolvedValue(undefined),
        delete: jest.fn().mockResolvedValue(undefined),
      },
      cartItem: {
        findUnique: jest.fn().mockResolvedValue(null),
        findFirst: jest.fn(),
        upsert: jest.fn().mockResolvedValue({ id: 'item-1', quantity: 3 }),
        update: jest.fn().mockResolvedValue(undefined),
        deleteMany: jest.fn().mockResolvedValue({ count: 1 }),
      },
      productVariant: {
        findFirst: jest.fn().mockResolvedValue({
          id: variant.id,
          inventory: { quantity: 10, reserved: 2 },
        }),
      },
      coupon: {
        findUnique: jest.fn(),
      },
    };
    const prisma = {
      cart: {
        upsert: jest.fn().mockResolvedValue({ id: 'cart-1' }),
        findUnique: jest.fn().mockResolvedValue(null),
        findUniqueOrThrow: jest.fn().mockResolvedValue(cartRecord),
        deleteMany: jest.fn().mockResolvedValue({ count: 1 }),
        update: jest.fn().mockResolvedValue(undefined),
      },
      coupon: {
        findUnique: jest.fn(),
      },
      $transaction: jest.fn((callback) => callback(transaction)),
    };

    return {
      service: new CartService(prisma as never),
      prisma,
      transaction,
      cartRecord,
      variant,
    };
  }

  it('creates a guest cart using only a token hash in storage', async () => {
    const { service, prisma } = makeService();

    const result = await service.getCart();

    expect(result.guestToken).toMatch(/^[A-Za-z0-9_-]{43}$/);
    const storedGuestToken = createHash('sha256')
      .update(result.guestToken!)
      .digest('hex');
    expect(prisma.cart.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { guestToken: storedGuestToken },
        create: {
          guestToken: storedGuestToken,
          expiresAt: expect.any(Date),
        },
        update: { expiresAt: expect.any(Date) },
        select: { id: true },
      }),
    );
    expect(result.data).toMatchObject({
      subtotalAmount: 2500,
      discountAmount: 0,
      totalAmount: 2500,
      items: [{ unitPriceAmount: 1250, lineTotalAmount: 2500 }],
    });
  });

  it('rotates expired guest tokens instead of reopening their old cart', async () => {
    const { service, prisma } = makeService();
    const expiredToken = 'E'.repeat(43);
    prisma.cart.findUnique.mockResolvedValue({
      id: 'expired-cart',
      expiresAt: new Date(Date.now() - 1),
    });

    const result = await service.getCart(undefined, expiredToken);

    expect(result.guestToken).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(result.guestToken).not.toBe(expiredToken);
    expect(prisma.cart.deleteMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          id: 'expired-cart',
          guestToken: expect.any(String),
        }),
      }),
    );
    expect(prisma.cart.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          guestToken: createHash('sha256')
            .update(result.guestToken!)
            .digest('hex'),
        },
      }),
    );
  });

  it('increments an existing line atomically and checks available stock', async () => {
    const { service, transaction } = makeService();

    await service.addItem(undefined, 'A'.repeat(43), {
      variantId: 'variant-1',
      quantity: 1,
    });

    expect(transaction.cartItem.upsert).toHaveBeenCalledWith({
      where: {
        cartId_variantId: { cartId: 'cart-1', variantId: 'variant-1' },
      },
      create: { cartId: 'cart-1', variantId: 'variant-1', quantity: 1 },
      update: { quantity: { increment: 1 } },
    });
    expect(transaction.$queryRaw).toHaveBeenCalled();
    expect(transaction.productVariant.findFirst).toHaveBeenCalled();
  });

  it('rejects a cart line that exceeds available stock', async () => {
    const { service, transaction } = makeService();
    transaction.productVariant.findFirst.mockResolvedValue({
      id: 'variant-1',
      inventory: { quantity: 2, reserved: 2 },
    });

    await expect(
      service.addItem(undefined, 'B'.repeat(43), {
        variantId: 'variant-1',
        quantity: 1,
      }),
    ).rejects.toBeInstanceOf(ConflictException);
    expect(transaction.cartItem.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        update: { quantity: { increment: 1 } },
      }),
    );
  });

  it('applies percentage coupons in integer minor units with a maximum discount cap', async () => {
    const { service, prisma, transaction, cartRecord } = makeService();
    cartRecord.couponCode = 'SAVE25';
    const coupon = {
      code: 'SAVE25',
      description: 'Quarter off',
      discountType: 'PERCENTAGE',
      valueAmount: 2500,
      maxDiscountAmount: 300,
      minimumOrderAmount: 1000,
      startsAt: null,
      expiresAt: null,
      maxUses: 50,
      usesCount: 1,
      isActive: true,
      deletedAt: null,
    };
    transaction.coupon.findUnique.mockResolvedValue(coupon);
    prisma.coupon.findUnique.mockResolvedValue(coupon);

    const result = await service.applyCoupon(undefined, 'C'.repeat(43), {
      code: 'SAVE25',
    });

    expect(transaction.cart.update).toHaveBeenCalledWith({
      where: { id: 'cart-1' },
      data: { couponCode: 'SAVE25' },
    });
    expect(result.data).toMatchObject({
      subtotalAmount: 2500,
      discountAmount: 300,
      totalAmount: 2200,
      coupon: { code: 'SAVE25', valid: true, discountAmount: 300 },
    });
  });

  it('merges guest quantities into the signed-in cart and deletes the guest cart atomically', async () => {
    const { service, transaction } = makeService();
    transaction.cart.findUnique.mockResolvedValue({
      id: 'guest-cart',
      couponCode: 'SAVE10',
      expiresAt: new Date(Date.now() + 60_000),
      items: [{ variantId: 'variant-1', quantity: 3 }],
    });
    transaction.cart.upsert.mockResolvedValue({
      id: 'user-cart',
      couponCode: null,
    });
    transaction.cartItem.findUnique.mockResolvedValue({ quantity: 2 });

    await service.mergeGuestCart('user-1', 'D'.repeat(43));

    expect(transaction.cartItem.upsert).toHaveBeenCalledWith({
      where: {
        cartId_variantId: { cartId: 'user-cart', variantId: 'variant-1' },
      },
      create: {
        cartId: 'user-cart',
        variantId: 'variant-1',
        quantity: 5,
      },
      update: { quantity: 5 },
    });
    expect(transaction.cart.update).toHaveBeenCalledWith({
      where: { id: 'user-cart' },
      data: { couponCode: 'SAVE10' },
    });
    expect(transaction.cart.delete).toHaveBeenCalledWith({
      where: { id: 'guest-cart' },
    });
  });

  it('does not expose cart items owned by a different cart', async () => {
    const { service, transaction } = makeService();
    transaction.cartItem.findFirst.mockResolvedValue(null);

    await expect(
      service.updateItem('user-1', undefined, 'foreign-item', {
        quantity: 1,
      }),
    ).rejects.toBeInstanceOf(NotFoundException);
  });

  it('rejects applying coupons to empty carts', async () => {
    const { service, transaction, cartRecord } = makeService();
    cartRecord.items = [];
    transaction.cart.findUniqueOrThrow.mockResolvedValue(cartRecord);

    await expect(
      service.applyCoupon('user-1', undefined, { code: 'SAVE25' }),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(transaction.coupon.findUnique).not.toHaveBeenCalled();
  });
});
