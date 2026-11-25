import { NotFoundException } from '@nestjs/common';
import { UsersService } from '../dist/users/users.service';

describe('UsersService', () => {
  it('does not allow deleting another user’s address', async () => {
    const prisma = {
      address: {
        updateMany: jest.fn().mockResolvedValue({ count: 0 }),
      },
    };
    const service = new UsersService(prisma as never);

    await expect(
      service.deleteAddress('owner-1', 'address-owned-by-someone-else'),
    ).rejects.toBeInstanceOf(NotFoundException);
    expect(prisma.address.updateMany).toHaveBeenCalledWith({
      where: {
        id: 'address-owned-by-someone-else',
        userId: 'owner-1',
        deletedAt: null,
      },
      data: { deletedAt: expect.any(Date), isDefault: false },
    });
  });

  it('makes a user’s first address their default address', async () => {
    const transaction = {
      address: {
        count: jest.fn().mockResolvedValue(0),
        updateMany: jest.fn().mockResolvedValue({ count: 0 }),
        create: jest.fn().mockResolvedValue({ id: 'address-1', isDefault: true }),
      },
    };
    const prisma = {
      $transaction: jest.fn((callback) => callback(transaction)),
    };
    const service = new UsersService(prisma as never);

    await service.createAddress('owner-1', {
      fullName: 'Alex Morgan',
      line1: '120 Market Street',
      city: 'Portland',
      region: 'Oregon',
      postalCode: '97205',
      countryCode: 'US',
      type: 'BOTH',
    } as never);

    expect(transaction.address.create).toHaveBeenCalledWith({
      data: expect.objectContaining({ userId: 'owner-1', isDefault: true }),
    });
  });

  it('paginates wishlist items and reports current inventory availability', async () => {
    const item = {
      id: 'wishlist-item-1',
      createdAt: new Date('2026-01-01T00:00:00Z'),
      variant: {
        id: 'variant-1',
        sku: 'SKU-1',
        name: 'Blue / Medium',
        optionValues: { color: 'Blue', size: 'M' },
        priceAmount: 3200,
        inventory: { quantity: 3, reserved: 2 },
        product: {
          id: 'product-1',
          name: 'Everyday Tee',
          slug: 'everyday-tee',
          brand: 'Northline',
          category: { id: 'category-1', name: 'Apparel', slug: 'apparel' },
          images: [],
        },
      },
    };
    const prisma = {
      wishlist: {
        findUnique: jest.fn().mockResolvedValue({ id: 'wishlist-1' }),
      },
      wishlistItem: {
        findMany: jest.fn().mockResolvedValue([item]),
        count: jest.fn().mockResolvedValue(3),
      },
    };
    const service = new UsersService(prisma as never);

    const result = await service.listWishlist('owner-1', {
      page: 2,
      limit: 1,
      sort: 'oldest',
    } as never);

    expect(result.data[0]).toMatchObject({
      id: 'wishlist-item-1',
      variantId: 'variant-1',
      priceAmount: 3200,
      inStock: true,
      product: { slug: 'everyday-tee' },
    });
    expect(result.pagination).toEqual({
      page: 2,
      limit: 1,
      total: 3,
      totalPages: 3,
    });
    expect(prisma.wishlistItem.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        skip: 1,
        take: 1,
        orderBy: { createdAt: 'asc' },
      }),
    );
  });

  it('adds only active variants and uses the unique key to avoid duplicate items', async () => {
    const transaction = {
      productVariant: {
        findFirst: jest.fn().mockResolvedValue({ id: 'variant-1' }),
      },
      wishlist: {
        upsert: jest.fn().mockResolvedValue({ id: 'wishlist-1' }),
      },
      wishlistItem: {
        upsert: jest.fn().mockResolvedValue({ id: 'wishlist-item-1' }),
      },
    };
    const prisma = {
      $transaction: jest.fn((callback) => callback(transaction)),
      wishlist: {
        findUnique: jest.fn().mockResolvedValue({ id: 'wishlist-1' }),
      },
      wishlistItem: {
        findMany: jest.fn().mockResolvedValue([]),
        count: jest.fn().mockResolvedValue(0),
      },
    };
    const service = new UsersService(prisma as never);

    await service.addWishlistItem('owner-1', 'variant-1');

    expect(transaction.wishlistItem.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          wishlistId_variantId: {
            wishlistId: 'wishlist-1',
            variantId: 'variant-1',
          },
        },
      }),
    );
  });

  it('rejects a wishlist item for an inactive or missing product variant', async () => {
    const transaction = {
      productVariant: {
        findFirst: jest.fn().mockResolvedValue(null),
      },
      wishlist: { upsert: jest.fn() },
      wishlistItem: { upsert: jest.fn() },
    };
    const prisma = {
      $transaction: jest.fn((callback) => callback(transaction)),
    };
    const service = new UsersService(prisma as never);

    await expect(
      service.addWishlistItem('owner-1', 'unavailable-variant'),
    ).rejects.toBeInstanceOf(NotFoundException);
    expect(transaction.wishlist.upsert).not.toHaveBeenCalled();
  });

  it('does not allow deleting another user’s wishlist item', async () => {
    const prisma = {
      wishlist: {
        findUnique: jest.fn().mockResolvedValue({ id: 'wishlist-owner-1' }),
      },
      wishlistItem: {
        deleteMany: jest.fn().mockResolvedValue({ count: 0 }),
      },
    };
    const service = new UsersService(prisma as never);

    await expect(
      service.deleteWishlistItem('owner-1', 'other-user-item'),
    ).rejects.toBeInstanceOf(NotFoundException);
    expect(prisma.wishlistItem.deleteMany).toHaveBeenCalledWith({
      where: { id: 'other-user-item', wishlistId: 'wishlist-owner-1' },
    });
  });
});
