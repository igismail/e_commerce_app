import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Patch,
  Post,
  Req,
  Res,
  UseGuards,
} from '@nestjs/common';
import {
  ApiCookieAuth,
  ApiOkResponse,
  ApiTags,
} from '@nestjs/swagger';
import type { Request, Response } from 'express';
import { AuthPrincipal } from '../auth/auth.types';
import { RedisService } from '../redis.service';
import { GUEST_CART_COOKIE, GUEST_CART_COOKIE_PATH } from './cart.constants';
import {
  AddCartItemDto,
  ApplyCouponDto,
  CartItemParamsDto,
  UpdateCartItemDto,
} from './cart.dto';
import { CartService } from './cart.service';
import { OptionalJwtAuthGuard } from './optional-jwt-auth.guard';

const GUEST_CART_COOKIE_MAX_AGE = 30 * 24 * 60 * 60 * 1000;

type CartRequest = Request & {
  user?: AuthPrincipal;
};

@ApiTags('cart')
@UseGuards(OptionalJwtAuthGuard)
@Controller('cart')
export class CartController {
  constructor(
    private readonly cart: CartService,
    private readonly redis: RedisService,
  ) {}

  @Get()
  @ApiCookieAuth(GUEST_CART_COOKIE)
  @ApiOkResponse({ description: 'Current guest or authenticated shopping cart.' })
  async getCart(
    @Req() request: CartRequest,
    @Res({ passthrough: true }) response: Response,
  ) {
    const result = await this.cart.getCart(
      request.user?.id,
      this.guestToken(request),
    );
    return this.sendResult(result, response);
  }

  @Post('items')
  @HttpCode(HttpStatus.OK)
  @ApiCookieAuth(GUEST_CART_COOKIE)
  @ApiOkResponse({ description: 'Add a variant to the current cart.' })
  async addItem(
    @Body() body: AddCartItemDto,
    @Req() request: CartRequest,
    @Res({ passthrough: true }) response: Response,
  ) {
    const result = await this.cart.addItem(
      request.user?.id,
      this.guestToken(request),
      body,
    );
    return this.sendResult(result, response);
  }

  @Patch('items/:itemId')
  @ApiCookieAuth(GUEST_CART_COOKIE)
  async updateItem(
    @Param() params: CartItemParamsDto,
    @Body() body: UpdateCartItemDto,
    @Req() request: CartRequest,
    @Res({ passthrough: true }) response: Response,
  ) {
    const result = await this.cart.updateItem(
      request.user?.id,
      this.guestToken(request),
      params.itemId,
      body,
    );
    return this.sendResult(result, response);
  }

  @Delete('items/:itemId')
  @ApiCookieAuth(GUEST_CART_COOKIE)
  async removeItem(
    @Param() params: CartItemParamsDto,
    @Req() request: CartRequest,
    @Res({ passthrough: true }) response: Response,
  ) {
    const result = await this.cart.removeItem(
      request.user?.id,
      this.guestToken(request),
      params.itemId,
    );
    return this.sendResult(result, response);
  }

  @Post('coupon')
  @HttpCode(HttpStatus.OK)
  @ApiCookieAuth(GUEST_CART_COOKIE)
  async applyCoupon(
    @Body() body: ApplyCouponDto,
    @Req() request: CartRequest,
    @Res({ passthrough: true }) response: Response,
  ) {
    await this.redis.enforceRateLimit(
      `cart:coupon:ip:${request.ip}`,
      10,
      60 * 60,
    );
    const result = await this.cart.applyCoupon(
      request.user?.id,
      this.guestToken(request),
      body,
    );
    return this.sendResult(result, response);
  }

  @Delete('coupon')
  @ApiCookieAuth(GUEST_CART_COOKIE)
  async removeCoupon(
    @Req() request: CartRequest,
    @Res({ passthrough: true }) response: Response,
  ) {
    const result = await this.cart.removeCoupon(
      request.user?.id,
      this.guestToken(request),
    );
    return this.sendResult(result, response);
  }

  private guestToken(request: CartRequest) {
    const token = request.cookies?.[GUEST_CART_COOKIE];
    return typeof token === 'string' ? token : undefined;
  }

  private sendResult(
    result: Awaited<ReturnType<CartService['getCart']>>,
    response: Response,
  ) {
    if (result.guestToken) {
      response.cookie(GUEST_CART_COOKIE, result.guestToken, {
        httpOnly: true,
        secure: process.env.NODE_ENV === 'production',
        sameSite: 'strict',
        path: GUEST_CART_COOKIE_PATH,
        maxAge: GUEST_CART_COOKIE_MAX_AGE,
      });
    }
    return result.data;
  }
}
