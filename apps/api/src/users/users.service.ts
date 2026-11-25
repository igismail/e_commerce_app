import { Injectable, NotFoundException } from '@nestjs/common';
import { ProductStatus } from '../generated/prisma/client';
import { PrismaService } from '../prisma.service';
import { AuthPrincipal } from '../auth/auth.types';
import {
  CreateAddressDto,
  UpdateAddressDto,
  UpdateProfileDto,
  WishlistQueryDto,
  WishlistSort,
} from './users.dto';

@Injectable()
export class UsersService {
  constructor(private readonly prisma: PrismaService) {}

  async getProfile(userId: string) {
    const user = await this.prisma.user.findFirst({
      where: { id: userId, deletedAt: null, isActive: true },
      select: {
        id: true,
        email: true,
        firstName: true,
        lastName: true,
        role: true,
        emailVerifiedAt: true,
        createdAt: true,
        updatedAt: true,
      },
    });
    if (!user) {
      throw new NotFoundException('User not found');
    }
    return user;
  }

  async updateProfile(user: AuthPrincipal, input: UpdateProfileDto) {
    await this.prisma.user.updateMany({
      where: { id: user.id, deletedAt: null, isActive: true },
      data: input,
    });
    return this.getProfile(user.id);
  }

  listAddresses(userId: string) {
    return this.prisma.address.findMany({
      where: { userId, deletedAt: null },
      orderBy: [{ isDefault: 'desc' }, { createdAt: 'desc' }],
    });
  }

  async createAddress(userId: string, input: CreateAddressDto) {
    return this.prisma.$transaction(async (transaction) => {
      const activeAddressCount = await transaction.address.count({
        where: { userId, deletedAt: null },
      });
      const isDefault = input.isDefault ?? activeAddressCount === 0;
      if (isDefault) {
        await transaction.address.updateMany({
          where: { userId, deletedAt: null, isDefault: true },
          data: { isDefault: false },
        });
      }

      return transaction.address.create({
        data: { ...input, userId, isDefault },
      });
    });
  }

  async updateAddress(
    userId: string,
    addressId: string,
    input: UpdateAddressDto,
  ) {
    return this.prisma.$transaction(async (transaction) => {
      const address = await transaction.address.findFirst({
        where: { id: addressId, userId, deletedAt: null },
      });
      if (!address) {
        throw new NotFoundException('Address not found');
      }

      if (input.isDefault === true) {
        await transaction.address.updateMany({
          where: { userId, deletedAt: null, isDefault: true },
          data: { isDefault: false },
        });
      }

      return transaction.address.update({
        where: { id: address.id },
        data: input,
      });
    });
  }

  async deleteAddress(userId: string, addressId: string) {
    const result = await this.prisma.address.updateMany({
      where: { id: addressId, userId, deletedAt: null },
      data: { deletedAt: new Date(), isDefault: false },
    });
    if (result.count !== 1) {
      throw new NotFoundException('Address not found');
    }
  }

  async listWishlist(userId: string, query: WishlistQueryDto) {
    const wishlist = await this.prisma.wishlist.findUnique({
      where: { userId },
    });
    const page = query.page ?? 1;
    const limit = query.limit ?? 20;
    if (!wishlist) {
      return {
        data: [],
        pagination: { page, limit, total: 0, totalPages: 0 },
      };
    }

    const where = {
      wishlistId: wishlist.id,
      variant: {
        is: {
          isActive: true,
          deletedAt: null,
          product: {
            is: { status: ProductStatus.ACTIVE, deletedAt: null },
          },
        },
      },
    };
    const [items, total] = await Promise.all([
      this.prisma.wishlistItem.findMany({
        where,
        orderBy: { createdAt: query.sort === WishlistSort.OLDEST ? 'asc' : 'desc' },
        skip: (page - 1) * limit,
        take: limit,
        include: {
          variant: {
            include: {
              inventory: true,
              product: {
                include: {
                  category: true,
                  images: { orderBy: { sortOrder: 'asc' } },
                },
              },
            },
          },
        },
      }),
      this.prisma.wishlistItem.count({ where }),
    ]);

    return {
      data: items.map((item) => ({
        id: item.id,
        createdAt: item.createdAt,
        variantId: item.variant.id,
        variantName: item.variant.name,
        sku: item.variant.sku,
        optionValues: item.variant.optionValues,
        priceAmount: item.variant.priceAmount,
        inStock:
          (item.variant.inventory?.quantity ?? 0) -
            (item.variant.inventory?.reserved ?? 0) >
          0,
        product: {
          id: item.variant.product.id,
          name: item.variant.product.name,
          slug: item.variant.product.slug,
          brand: item.variant.product.brand,
          category: item.variant.product.category,
          images: item.variant.product.images,
        },
      })),
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      },
    };
  }

  async addWishlistItem(userId: string, variantId: string) {
    await this.prisma.$transaction(async (transaction) => {
      const variant = await transaction.productVariant.findFirst({
        where: {
          id: variantId,
          isActive: true,
          deletedAt: null,
          product: {
            status: ProductStatus.ACTIVE,
            deletedAt: null,
          },
        },
        select: { id: true },
      });
      if (!variant) {
        throw new NotFoundException('Product variant not found');
      }

      const wishlist = await transaction.wishlist.upsert({
        where: { userId },
        create: { userId },
        update: {},
        select: { id: true },
      });
      await transaction.wishlistItem.upsert({
        where: {
          wishlistId_variantId: { wishlistId: wishlist.id, variantId },
        },
        create: { wishlistId: wishlist.id, variantId },
        update: {},
      });
    });
    return this.listWishlist(userId, {});
  }

  async deleteWishlistItem(userId: string, itemId: string) {
    const wishlist = await this.prisma.wishlist.findUnique({
      where: { userId },
      select: { id: true },
    });
    if (!wishlist) {
      throw new NotFoundException('Wishlist item not found');
    }
    const result = await this.prisma.wishlistItem.deleteMany({
      where: { id: itemId, wishlistId: wishlist.id },
    });
    if (result.count !== 1) {
      throw new NotFoundException('Wishlist item not found');
    }
  }
}
