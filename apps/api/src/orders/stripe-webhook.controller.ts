import {
  BadRequestException,
  Controller,
  Headers,
  HttpCode,
  HttpStatus,
  Post,
  RawBodyRequest,
  Req,
} from '@nestjs/common';
import { ApiHeader, ApiOkResponse, ApiTags } from '@nestjs/swagger';
import type { Request } from 'express';
import { StripeWebhookService } from './stripe-webhook.service';

@ApiTags('payments')
@Controller('webhooks')
export class StripeWebhookController {
  constructor(private readonly webhook: StripeWebhookService) {}

  @Post('stripe')
  @HttpCode(HttpStatus.OK)
  @ApiHeader({ name: 'stripe-signature', required: true })
  @ApiOkResponse({ description: 'Stripe event accepted or already processed.' })
  handle(
    @Req() request: RawBodyRequest<Request>,
    @Headers('stripe-signature') signature: string | undefined,
  ) {
    if (!signature) {
      throw new BadRequestException('Stripe signature header is required');
    }
    if (!Buffer.isBuffer(request.rawBody)) {
      throw new BadRequestException('Raw webhook payload is unavailable');
    }
    return this.webhook.handle(request.rawBody, signature);
  }
}
