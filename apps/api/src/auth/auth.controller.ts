import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Post,
  Req,
  Res,
  UnauthorizedException,
  UseGuards,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiCookieAuth,
  ApiOkResponse,
  ApiTags,
} from '@nestjs/swagger';
import { createHash } from 'node:crypto';
import type { CookieOptions, Request, Response } from 'express';
import { AuthGuard } from '@nestjs/passport';
import { RedisService } from '../redis.service';
import {
  GUEST_CART_COOKIE,
  GUEST_CART_COOKIE_PATH,
} from '../cart/cart.constants';
import { CurrentUser } from './current-user.decorator';
import {
  EmailDto,
  LoginDto,
  RegisterDto,
  ResetPasswordDto,
  TokenDto,
} from './auth.dto';
import { AuthService } from './auth.service';
import { AuthPrincipal, AuthSession } from './auth.types';
import { assertCsrfTokens } from './csrf';

const REFRESH_COOKIE = 'refresh_token';
const CSRF_COOKIE = 'csrf_token';
const COOKIE_PATH = '/api/v1/auth';
const REFRESH_COOKIE_MAX_AGE = 30 * 24 * 60 * 60 * 1000;

function cookieOptions(httpOnly: boolean): CookieOptions {
  return {
    httpOnly,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'strict',
    path: COOKIE_PATH,
    maxAge: REFRESH_COOKIE_MAX_AGE,
  };
}

function expiredCookieOptions(httpOnly: boolean): CookieOptions {
  const { maxAge: _maxAge, ...options } = cookieOptions(httpOnly);
  return options;
}

function emailRateLimitKey(action: string, email: string) {
  const hash = createHash('sha256')
    .update(email.trim().toLowerCase())
    .digest('hex');
  return `auth:${action}:email:${hash}`;
}

@ApiTags('auth')
@Controller('auth')
export class AuthController {
  constructor(
    private readonly auth: AuthService,
    private readonly redis: RedisService,
  ) {}

  @Post('register')
  @HttpCode(HttpStatus.CREATED)
  async register(@Body() body: RegisterDto, @Req() request: Request) {
    await this.redis.enforceRateLimit(
      `auth:register:ip:${request.ip}`,
      5,
      60 * 60,
    );
    return this.auth.register(body);
  }

  @Post('login')
  @HttpCode(HttpStatus.OK)
  @ApiOkResponse({ description: 'Access token and CSRF token; refresh token is an HTTP-only cookie.' })
  async login(
    @Body() body: LoginDto,
    @Req() request: Request,
    @Res({ passthrough: true }) response: Response,
  ) {
    await this.redis.enforceRateLimit(
      `auth:login:ip:${request.ip}`,
      20,
      15 * 60,
    );
    await this.redis.enforceRateLimit(
      emailRateLimitKey('login', body.email),
      10,
      15 * 60,
    );
    const guestCartToken = request.cookies?.[GUEST_CART_COOKIE];
    const session = await this.auth.login(
      body,
      typeof guestCartToken === 'string' ? guestCartToken : undefined,
    );
    if (typeof guestCartToken === 'string') {
      response.clearCookie(GUEST_CART_COOKIE, {
        httpOnly: true,
        secure: process.env.NODE_ENV === 'production',
        sameSite: 'strict',
        path: GUEST_CART_COOKIE_PATH,
      });
    }
    this.setSessionCookies(response, session);
    return this.publicSession(session);
  }

  @Post('refresh')
  @HttpCode(HttpStatus.OK)
  @ApiCookieAuth(REFRESH_COOKIE)
  async refresh(
    @Req() request: Request,
    @Res({ passthrough: true }) response: Response,
  ) {
    assertCsrfTokens(request.cookies?.[CSRF_COOKIE], request.get('x-csrf-token'));
    const refreshToken = request.cookies?.[REFRESH_COOKIE];
    if (typeof refreshToken !== 'string') {
      throw new UnauthorizedException('Refresh session is required');
    }
    const session = await this.auth.refresh(refreshToken);
    this.setSessionCookies(response, session);
    return this.publicSession(session);
  }

  @Post('logout')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiCookieAuth(REFRESH_COOKIE)
  async logout(
    @Req() request: Request,
    @Res({ passthrough: true }) response: Response,
  ) {
    const refreshToken = request.cookies?.[REFRESH_COOKIE];
    if (refreshToken !== undefined && typeof refreshToken !== 'string') {
      throw new UnauthorizedException('Refresh session is invalid');
    }
    if (refreshToken) {
      assertCsrfTokens(
        request.cookies?.[CSRF_COOKIE],
        request.get('x-csrf-token'),
      );
    }
    await this.auth.logout(refreshToken);
    response.clearCookie(REFRESH_COOKIE, expiredCookieOptions(true));
    response.clearCookie(CSRF_COOKIE, expiredCookieOptions(false));
  }

  @Post('verify-email')
  @HttpCode(HttpStatus.OK)
  async verifyEmail(@Body() body: TokenDto, @Req() request: Request) {
    await this.redis.enforceRateLimit(
      `auth:verify-email:ip:${request.ip}`,
      20,
      60 * 60,
    );
    return this.auth.verifyEmail(body.token);
  }

  @Post('resend-verification')
  @HttpCode(HttpStatus.OK)
  async resendVerification(@Body() body: EmailDto, @Req() request: Request) {
    await this.redis.enforceRateLimit(
      `auth:resend-verification:ip:${request.ip}`,
      5,
      60 * 60,
    );
    await this.redis.enforceRateLimit(
      emailRateLimitKey('resend-verification', body.email),
      3,
      60 * 60,
    );
    return this.auth.resendVerification(body);
  }

  @Post('forgot-password')
  @HttpCode(HttpStatus.OK)
  async forgotPassword(@Body() body: EmailDto, @Req() request: Request) {
    await this.redis.enforceRateLimit(
      `auth:forgot-password:ip:${request.ip}`,
      5,
      60 * 60,
    );
    await this.redis.enforceRateLimit(
      emailRateLimitKey('forgot-password', body.email),
      3,
      60 * 60,
    );
    return this.auth.forgotPassword(body);
  }

  @Post('reset-password')
  @HttpCode(HttpStatus.OK)
  async resetPassword(@Body() body: ResetPasswordDto, @Req() request: Request) {
    await this.redis.enforceRateLimit(
      `auth:reset-password:ip:${request.ip}`,
      10,
      60 * 60,
    );
    return this.auth.resetPassword(body);
  }

  @Get('me')
  @UseGuards(AuthGuard('jwt'))
  @ApiBearerAuth()
  @ApiOkResponse({ description: 'Current authenticated user.' })
  me(@CurrentUser() user: AuthPrincipal) {
    return user;
  }

  private setSessionCookies(response: Response, session: AuthSession) {
    response.cookie(
      REFRESH_COOKIE,
      session.refreshToken,
      cookieOptions(true),
    );
    response.cookie(CSRF_COOKIE, session.csrfToken, cookieOptions(false));
  }

  private publicSession(session: AuthSession) {
    return {
      accessToken: session.accessToken,
      tokenType: 'Bearer',
      expiresIn: 15 * 60,
      csrfToken: session.csrfToken,
    };
  }
}
