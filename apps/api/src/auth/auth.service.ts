import {
  BadRequestException,
  ConflictException,
  Injectable,
  Logger,
  UnauthorizedException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { createHash, randomBytes } from 'node:crypto';
import bcrypt from 'bcryptjs';
import {
  AuthTokenPurpose,
  Prisma,
  User,
} from '../generated/prisma/client';
import { PrismaService } from '../prisma.service';
import { CartService } from '../cart/cart.service';
import { EmailService } from './email.service';
import { AuthSession } from './auth.types';
import { ACCESS_TOKEN_TTL_SECONDS, REFRESH_TOKEN_TTL_DAYS } from './auth.config';
import { EmailDto, LoginDto, RegisterDto, ResetPasswordDto } from './auth.dto';

const MAX_FAILED_LOGINS = 5;
const LOCKOUT_MINUTES = 15;
const VERIFY_TOKEN_HOURS = 24;
const RESET_TOKEN_MINUTES = 60;
const DUMMY_PASSWORD_HASH = bcrypt.hashSync(
  'Dummy-password-used-only-to-equalize-login-work',
  12,
);
const INVALID_CREDENTIALS = 'Invalid email or password';

function hashOpaqueToken(token: string) {
  return createHash('sha256').update(token).digest('hex');
}

function createOpaqueToken() {
  return randomBytes(32).toString('base64url');
}

function assertPasswordByteLength(password: string) {
  if (Buffer.byteLength(password, 'utf8') > 72) {
    throw new BadRequestException('Password must be at most 72 UTF-8 bytes');
  }
}

function isUniqueConstraintError(error: unknown) {
  return (
    error instanceof Prisma.PrismaClientKnownRequestError &&
    error.code === 'P2002'
  );
}

@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name);
  private readonly dummyPasswordHash = Promise.resolve(DUMMY_PASSWORD_HASH);

  constructor(
    private readonly prisma: PrismaService,
    private readonly jwt: JwtService,
    private readonly email: EmailService,
    private readonly cart: CartService,
  ) {}

  async register(input: RegisterDto) {
    assertPasswordByteLength(input.password);
    const email = input.email.trim().toLowerCase();
    const passwordHash = await bcrypt.hash(input.password, 12);
    const rawToken = createOpaqueToken();

    let user: User;
    try {
      user = await this.prisma.$transaction(async (transaction) => {
        const created = await transaction.user.create({
          data: {
            email,
            passwordHash,
            firstName: input.firstName.trim(),
            lastName: input.lastName.trim(),
          },
        });
        await transaction.authToken.create({
          data: {
            userId: created.id,
            tokenHash: hashOpaqueToken(rawToken),
            purpose: AuthTokenPurpose.EMAIL_VERIFICATION,
            expiresAt: new Date(Date.now() + VERIFY_TOKEN_HOURS * 60 * 60 * 1000),
          },
        });
        return created;
      });
    } catch (error: unknown) {
      if (isUniqueConstraintError(error)) {
        throw new ConflictException('An account with this email already exists');
      }
      throw error;
    }

    await this.email.sendVerificationEmail(user.email, user.firstName, rawToken);
    return { message: 'Check your email to verify your account.' };
  }

  async login(
    input: LoginDto,
    guestCartToken?: string,
  ): Promise<AuthSession> {
    assertPasswordByteLength(input.password);
    const email = input.email.trim().toLowerCase();
    const user = await this.prisma.user.findUnique({ where: { email } });
    const passwordHash = user?.passwordHash ?? (await this.dummyPasswordHash);
    const passwordMatches = await bcrypt.compare(input.password, passwordHash);
    const now = new Date();
    const locked =
      user?.lockedUntil !== null &&
      user?.lockedUntil !== undefined &&
      user.lockedUntil > now;

    if (
      !user ||
      user.deletedAt ||
      !user.isActive ||
      locked ||
      !passwordMatches ||
      !user.emailVerifiedAt
    ) {
      if (
        user &&
        !user.deletedAt &&
        user.isActive &&
        !locked &&
        !passwordMatches
      ) {
        await this.recordFailedLogin(user.id, now);
      }
      throw new UnauthorizedException(INVALID_CREDENTIALS);
    }

    await this.prisma.user.update({
      where: { id: user.id },
      data: { failedLoginAttempts: 0, lockedUntil: null },
    });
    if (guestCartToken) {
      await this.cart.mergeGuestCart(user.id, guestCartToken);
    }
    return this.createSession(user);
  }

  async refresh(rawRefreshToken: string): Promise<AuthSession> {
    if (!rawRefreshToken || rawRefreshToken.length > 256) {
      throw new UnauthorizedException('Refresh session is invalid or expired');
    }

    const tokenHash = hashOpaqueToken(rawRefreshToken);
    const nextRefreshToken = createOpaqueToken();
    const nextCsrfToken = createOpaqueToken();
    const now = new Date();
    const nextExpiry = new Date(
      now.getTime() + REFRESH_TOKEN_TTL_DAYS * 24 * 60 * 60 * 1000,
    );

    const outcome = await this.prisma.$transaction(async (transaction) => {
      const current = await transaction.refreshToken.findUnique({
        where: { tokenHash },
        include: { user: true },
      });
      if (!current) {
        return { kind: 'invalid' as const };
      }
      if (current.revokedAt) {
        return { kind: 'replay' as const, userId: current.userId };
      }
      if (
        current.expiresAt <= now ||
        !current.user.isActive ||
        current.user.deletedAt
      ) {
        return { kind: 'invalid' as const };
      }

      const revoked = await transaction.refreshToken.updateMany({
        where: { id: current.id, revokedAt: null, expiresAt: { gt: now } },
        data: { revokedAt: now },
      });
      if (revoked.count !== 1) {
        return { kind: 'replay' as const, userId: current.userId };
      }

      await transaction.refreshToken.create({
        data: {
          userId: current.userId,
          tokenHash: hashOpaqueToken(nextRefreshToken),
          expiresAt: nextExpiry,
        },
      });
      return {
        kind: 'rotated' as const,
        user: current.user,
      };
    });

    if (outcome.kind === 'replay') {
      await this.prisma.refreshToken.updateMany({
        where: { userId: outcome.userId, revokedAt: null },
        data: { revokedAt: now },
      });
      throw new UnauthorizedException('Refresh session reuse detected');
    }
    if (outcome.kind !== 'rotated') {
      throw new UnauthorizedException('Refresh session is invalid or expired');
    }

    return {
      accessToken: await this.signAccessToken(outcome.user),
      refreshToken: nextRefreshToken,
      csrfToken: nextCsrfToken,
    };
  }

  async logout(rawRefreshToken?: string) {
    if (!rawRefreshToken || rawRefreshToken.length > 256) {
      return;
    }
    await this.prisma.refreshToken.updateMany({
      where: {
        tokenHash: hashOpaqueToken(rawRefreshToken),
        revokedAt: null,
      },
      data: { revokedAt: new Date() },
    });
  }

  async verifyEmail(token: string) {
    const now = new Date();
    await this.prisma.$transaction(async (transaction) => {
      const authToken = await transaction.authToken.findUnique({
        where: { tokenHash: hashOpaqueToken(token) },
      });
      if (
        !authToken ||
        authToken.purpose !== AuthTokenPurpose.EMAIL_VERIFICATION ||
        authToken.usedAt ||
        authToken.expiresAt <= now
      ) {
        throw new BadRequestException('Verification link is invalid or expired');
      }

      const consumed = await transaction.authToken.updateMany({
        where: { id: authToken.id, usedAt: null, expiresAt: { gt: now } },
        data: { usedAt: now },
      });
      if (consumed.count !== 1) {
        throw new BadRequestException('Verification link is invalid or expired');
      }

      await transaction.user.update({
        where: { id: authToken.userId },
        data: { emailVerifiedAt: now },
      });
    });
    return { message: 'Email address verified. You can now sign in.' };
  }

  async resendVerification(input: EmailDto) {
    const user = await this.prisma.user.findUnique({
      where: { email: input.email.trim().toLowerCase() },
    });
    if (!user || user.deletedAt || user.emailVerifiedAt || !user.isActive) {
      return { message: 'If the account needs verification, an email will be sent.' };
    }

    const token = await this.createAuthToken(
      user.id,
      AuthTokenPurpose.EMAIL_VERIFICATION,
      VERIFY_TOKEN_HOURS * 60 * 60 * 1000,
    );
    await this.sendEmailWithoutAccountDisclosure(
      () => this.email.sendVerificationEmail(user.email, user.firstName, token),
      'verification',
    );
    return { message: 'If the account needs verification, an email will be sent.' };
  }

  async forgotPassword(input: EmailDto) {
    const user = await this.prisma.user.findUnique({
      where: { email: input.email.trim().toLowerCase() },
    });
    if (!user || user.deletedAt || !user.isActive) {
      return { message: 'If the account exists, password reset instructions will be sent.' };
    }

    const token = await this.createAuthToken(
      user.id,
      AuthTokenPurpose.PASSWORD_RESET,
      RESET_TOKEN_MINUTES * 60 * 1000,
    );
    await this.sendEmailWithoutAccountDisclosure(
      () => this.email.sendPasswordResetEmail(user.email, user.firstName, token),
      'password reset',
    );
    return { message: 'If the account exists, password reset instructions will be sent.' };
  }

  async resetPassword(input: ResetPasswordDto) {
    assertPasswordByteLength(input.password);
    const passwordHash = await bcrypt.hash(input.password, 12);
    const tokenHash = hashOpaqueToken(input.token);
    const now = new Date();

    await this.prisma.$transaction(async (transaction) => {
      const authToken = await transaction.authToken.findUnique({
        where: { tokenHash },
      });
      if (
        !authToken ||
        authToken.purpose !== AuthTokenPurpose.PASSWORD_RESET ||
        authToken.usedAt ||
        authToken.expiresAt <= now
      ) {
        throw new BadRequestException('Reset link is invalid or expired');
      }

      const consumed = await transaction.authToken.updateMany({
        where: { id: authToken.id, usedAt: null, expiresAt: { gt: now } },
        data: { usedAt: now },
      });
      if (consumed.count !== 1) {
        throw new BadRequestException('Reset link is invalid or expired');
      }

      await transaction.user.update({
        where: { id: authToken.userId },
        data: {
          passwordHash,
          failedLoginAttempts: 0,
          lockedUntil: null,
        },
      });
      await transaction.refreshToken.updateMany({
        where: { userId: authToken.userId, revokedAt: null },
        data: { revokedAt: now },
      });
      await transaction.authToken.updateMany({
        where: {
          userId: authToken.userId,
          purpose: AuthTokenPurpose.PASSWORD_RESET,
          usedAt: null,
        },
        data: { usedAt: now },
      });
    });

    return { message: 'Password has been reset. Please sign in again.' };
  }

  private async createAuthToken(
    userId: string,
    purpose: AuthTokenPurpose,
    lifetimeMs: number,
  ) {
    const token = createOpaqueToken();
    const now = new Date();
    await this.prisma.$transaction(async (transaction) => {
      await transaction.authToken.updateMany({
        where: { userId, purpose, usedAt: null },
        data: { usedAt: now },
      });
      await transaction.authToken.create({
        data: {
          userId,
          purpose,
          tokenHash: hashOpaqueToken(token),
          expiresAt: new Date(now.getTime() + lifetimeMs),
        },
      });
    });
    return token;
  }

  private async sendEmailWithoutAccountDisclosure(
    send: () => Promise<void>,
    purpose: string,
  ) {
    try {
      await send();
    } catch (error: unknown) {
      this.logger.error(
        `Failed to send ${purpose} email`,
        error instanceof Error ? error.stack : String(error),
      );
    }
  }

  private async recordFailedLogin(userId: string, now: Date) {
    const lockedUntil = new Date(now.getTime() + LOCKOUT_MINUTES * 60 * 1000);
    await this.prisma.$executeRaw`
      UPDATE "User"
      SET "failedLoginAttempts" = "failedLoginAttempts" + 1,
          "lockedUntil" = CASE
            WHEN "failedLoginAttempts" + 1 >= ${MAX_FAILED_LOGINS}
            THEN ${lockedUntil}
            ELSE "lockedUntil"
          END
      WHERE "id" = ${userId}
    `;
  }

  private async createSession(user: User): Promise<AuthSession> {
    const refreshToken = createOpaqueToken();
    const csrfToken = createOpaqueToken();
    await this.prisma.refreshToken.create({
      data: {
        userId: user.id,
        tokenHash: hashOpaqueToken(refreshToken),
        expiresAt: new Date(
          Date.now() + REFRESH_TOKEN_TTL_DAYS * 24 * 60 * 60 * 1000,
        ),
      },
    });
    return {
      accessToken: await this.signAccessToken(user),
      refreshToken,
      csrfToken,
    };
  }

  private signAccessToken(user: Pick<User, 'id' | 'email' | 'role'>) {
    return this.jwt.signAsync({
      sub: user.id,
      email: user.email,
      role: user.role,
    });
  }
}
