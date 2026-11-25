import { Logger, UnauthorizedException } from '@nestjs/common';
import bcrypt from 'bcryptjs';
import { AuthTokenPurpose } from '../dist/generated/prisma/client';
import { AuthService } from '../dist/auth/auth.service';

describe('AuthService', () => {
  afterEach(() => {
    jest.restoreAllMocks();
  });

  const user = {
    id: 'user_123',
    email: 'alex@example.com',
    passwordHash: '$2b$04$7uLJLYpHCPeJfvAQ9ss8IuXrM9Qv9e5QL7sWHrpYBeJ8GAlr4W8Fu',
    firstName: 'Alex',
    lastName: 'Morgan',
    role: 'CUSTOMER',
    emailVerifiedAt: new Date(),
    isActive: true,
    deletedAt: null,
    lockedUntil: null,
    failedLoginAttempts: 4,
  };

  function makeService() {
    const transaction = {
      user: {
        findUnique: jest.fn(),
        update: jest.fn(),
      },
      refreshToken: {
        findUnique: jest.fn(),
        updateMany: jest.fn().mockResolvedValue({ count: 1 }),
        create: jest.fn(),
      },
      authToken: {
        findUnique: jest.fn(),
        updateMany: jest.fn().mockResolvedValue({ count: 1 }),
        create: jest.fn(),
      },
    };
    const prisma = {
      user: {
        findUnique: jest.fn(),
        update: jest.fn().mockResolvedValue(user),
      },
      refreshToken: {
        updateMany: jest.fn().mockResolvedValue({ count: 1 }),
        create: jest.fn(),
      },
      $executeRaw: jest.fn(),
      $transaction: jest.fn((callback) => callback(transaction)),
      transaction,
    };
    const jwt = { signAsync: jest.fn().mockResolvedValue('short-lived-access') };
    const email = {
      sendVerificationEmail: jest.fn(),
      sendPasswordResetEmail: jest.fn(),
    };
    const cart = { mergeGuestCart: jest.fn().mockResolvedValue(undefined) };

    return {
      service: new AuthService(
        prisma as never,
        jwt as never,
        email as never,
        cart as never,
      ),
      prisma,
      transaction,
      jwt,
      email,
      cart,
    };
  }

  it('increments the failed-login counter atomically and returns a generic error', async () => {
    const { service, prisma, cart } = makeService();
    prisma.user.findUnique.mockResolvedValue(user);

    await expect(
      service.login(
        { email: user.email, password: 'WrongPassword123!' },
        'G'.repeat(43),
      ),
    ).rejects.toBeInstanceOf(UnauthorizedException);

    expect(prisma.$executeRaw).toHaveBeenCalledTimes(1);
    expect(prisma.$executeRaw.mock.calls[0][1]).toBe(5);
    expect(cart.mergeGuestCart).not.toHaveBeenCalled();
  });

  it('merges a guest cart only after valid credentials and before creating a session', async () => {
    const { service, prisma, cart } = makeService();
    const password = 'CorrectPassword123!';
    prisma.user.findUnique.mockResolvedValue({
      ...user,
      passwordHash: await bcrypt.hash(password, 4),
    });

    await service.login(
      { email: user.email, password },
      'G'.repeat(43),
    );

    expect(cart.mergeGuestCart).toHaveBeenCalledWith(user.id, 'G'.repeat(43));
    expect(prisma.refreshToken.create).toHaveBeenCalledTimes(1);
  });

  it('rotates a refresh token and persists only its hash', async () => {
    const { service, transaction } = makeService();
    transaction.refreshToken.findUnique.mockResolvedValue({
      id: 'refresh_1',
      userId: user.id,
      tokenHash: 'old-token-hash',
      expiresAt: new Date(Date.now() + 60_000),
      revokedAt: null,
      user,
    });

    const session = await service.refresh('old-opaque-token');

    expect(session.accessToken).toBe('short-lived-access');
    expect(session.refreshToken).not.toBe('old-opaque-token');
    expect(session.csrfToken).toBeTruthy();
    expect(transaction.refreshToken.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ id: 'refresh_1', revokedAt: null }),
      }),
    );
    expect(transaction.refreshToken.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        userId: user.id,
        tokenHash: expect.stringMatching(/^[a-f0-9]{64}$/),
      }),
    });
  });

  it('revokes remaining sessions when a rotated refresh token is replayed', async () => {
    const { service, transaction, prisma } = makeService();
    transaction.refreshToken.findUnique.mockResolvedValue({
      id: 'refresh_1',
      userId: user.id,
      expiresAt: new Date(Date.now() + 60_000),
      revokedAt: new Date(),
      user,
    });

    await expect(service.refresh('replayed-token')).rejects.toBeInstanceOf(
      UnauthorizedException,
    );
    expect(prisma.refreshToken.updateMany).toHaveBeenCalledWith({
      where: { userId: user.id, revokedAt: null },
      data: { revokedAt: expect.any(Date) },
    });
  });

  it('keeps password-reset responses generic when email delivery fails', async () => {
    const { service, prisma, email } = makeService();
    const logger = jest
      .spyOn(Logger.prototype, 'error')
      .mockImplementation(() => undefined);
    prisma.user.findUnique.mockResolvedValue(user);
    email.sendPasswordResetEmail.mockRejectedValue(new Error('SMTP unavailable'));

    await expect(
      service.forgotPassword({ email: user.email }),
    ).resolves.toEqual({
      message: 'If the account exists, password reset instructions will be sent.',
    });
    expect(logger).toHaveBeenCalled();
  });

  it('consumes reset tokens and revokes existing refresh sessions atomically', async () => {
    const { service, transaction } = makeService();
    const rawToken = 'single-use-reset-token';
    transaction.authToken.findUnique.mockResolvedValue({
      id: 'auth-token-1',
      userId: user.id,
      purpose: AuthTokenPurpose.PASSWORD_RESET,
      expiresAt: new Date(Date.now() + 60_000),
      usedAt: null,
    });

    await service.resetPassword({
      token: rawToken,
      password: 'NewStrongPassword123!',
    });

    expect(transaction.authToken.findUnique).toHaveBeenCalledWith({
      where: { tokenHash: expect.stringMatching(/^[a-f0-9]{64}$/) },
    });
    expect(transaction.user.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: user.id },
        data: expect.objectContaining({
          passwordHash: expect.stringMatching(/^\$2[aby]\$12\$/),
        }),
      }),
    );
    expect(transaction.refreshToken.updateMany).toHaveBeenCalledWith({
      where: { userId: user.id, revokedAt: null },
      data: { revokedAt: expect.any(Date) },
    });
  });
});
