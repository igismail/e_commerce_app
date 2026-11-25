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
});
