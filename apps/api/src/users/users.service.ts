import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma.service';
import { AuthPrincipal } from '../auth/auth.types';
import { CreateAddressDto, UpdateAddressDto, UpdateProfileDto } from './users.dto';

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
}
