import {
  Body,
  Controller,
  Get,
  Headers,
  HttpCode,
  HttpStatus,
  Param,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import {
  ApiBearerAuth,
  ApiCreatedResponse,
  ApiHeader,
  ApiTags,
} from '@nestjs/swagger';
import { CurrentUser } from '../auth/current-user.decorator';
import { AuthPrincipal } from '../auth/auth.types';
import { RedisService } from '../redis.service';
import { CheckoutDto, OrderIdParamsDto, OrdersQueryDto } from './checkout.dto';
import { OrdersService } from './orders.service';

@ApiTags('checkout', 'orders')
@ApiBearerAuth()
@UseGuards(AuthGuard('jwt'))
@Controller()
export class OrdersController {
  constructor(
    private readonly orders: OrdersService,
    private readonly redis: RedisService,
  ) {}

  @Post('checkout')
  @HttpCode(HttpStatus.CREATED)
  @ApiHeader({
    name: 'Idempotency-Key',
    required: true,
    description: 'Unique key for this checkout attempt; reuse it only to retry the same request.',
  })
  @ApiCreatedResponse({
    description: 'Order and Stripe PaymentIntent client secret.',
  })
  async checkout(
    @CurrentUser() user: AuthPrincipal,
    @Headers('idempotency-key') idempotencyKey: string | undefined,
    @Body() body: CheckoutDto,
  ) {
    await this.redis.enforceRateLimit(
      `checkout:user:${user.id}`,
      10,
      15 * 60,
    );
    return this.orders.createCheckout(user.id, idempotencyKey, body);
  }

  @Get('orders')
  list(
    @CurrentUser() user: AuthPrincipal,
    @Query() query: OrdersQueryDto,
  ) {
    return this.orders.listOrders(user.id, query);
  }

  @Get('orders/:orderId')
  get(
    @CurrentUser() user: AuthPrincipal,
    @Param() params: OrderIdParamsDto,
  ) {
    return this.orders.getOrder(user.id, params.orderId);
  }

  @Post('orders/:orderId/cancel')
  @HttpCode(HttpStatus.OK)
  cancel(
    @CurrentUser() user: AuthPrincipal,
    @Param() params: OrderIdParamsDto,
  ) {
    return this.orders.cancelOrder(user.id, params.orderId);
  }
}
