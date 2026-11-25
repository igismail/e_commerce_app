import {
  BadRequestException,
  Injectable,
  ServiceUnavailableException,
} from '@nestjs/common';
import Stripe from 'stripe';
import {
  CreatePaymentIntentInput,
  PaymentIntentSession,
  PaymentProvider,
  PaymentProviderEvent,
} from './payment-provider';

@Injectable()
export class StripePaymentProvider implements PaymentProvider {
  private stripe?: Stripe;

  async createPaymentIntent(
    input: CreatePaymentIntentInput,
  ): Promise<PaymentIntentSession> {
    try {
      const intent = await this.client().paymentIntents.create(
        {
          amount: input.amount,
          currency: input.currency.toLowerCase(),
          automatic_payment_methods: { enabled: true },
          receipt_email: input.customerEmail,
          metadata: { orderId: input.orderId, paymentId: input.paymentId },
        },
        { idempotencyKey: input.idempotencyKey },
      );
      if (!intent.client_secret) {
        throw new ServiceUnavailableException(
          'Payment provider did not return a payment session',
        );
      }
      return { id: intent.id, clientSecret: intent.client_secret };
    } catch (error) {
      this.rethrowProviderError(error, 'create a payment session');
    }
  }

  async cancelPaymentIntent(
    id: string,
    idempotencyKey: string,
  ): Promise<{ status: string }> {
    try {
      const stripe = this.client();
      const current = await stripe.paymentIntents.retrieve(id);
      if (
        current.status === 'succeeded' ||
        current.status === 'canceled' ||
        current.status === 'processing'
      ) {
        return { status: current.status };
      }
      const canceled = await stripe.paymentIntents.cancel(
        id,
        {},
        { idempotencyKey },
      );
      return { status: canceled.status };
    } catch (error) {
      this.rethrowProviderError(error, 'cancel the payment session');
    }
  }

  async refundPaymentIntent(
    id: string,
    idempotencyKey: string,
  ): Promise<{ id: string; status: string; amount: number }> {
    try {
      const refund = await this.client().refunds.create(
        { payment_intent: id },
        { idempotencyKey },
      );
      return {
        id: refund.id,
        status: refund.status ?? 'pending',
        amount: refund.amount,
      };
    } catch (error) {
      this.rethrowProviderError(error, 'refund the payment');
    }
  }

  verifyWebhook(rawBody: Buffer, signature: string): PaymentProviderEvent {
    const secret = process.env.STRIPE_WEBHOOK_SECRET;
    if (!secret) {
      throw new ServiceUnavailableException(
        'Stripe webhook verification is not configured',
      );
    }

    let event: Stripe.Event;
    try {
      event = this.client().webhooks.constructEvent(rawBody, signature, secret);
    } catch (error) {
      if (error instanceof Stripe.errors.StripeSignatureVerificationError) {
        throw new BadRequestException('Invalid Stripe webhook signature');
      }
      this.rethrowProviderError(error, 'verify the payment notification');
    }

    if (event.type.startsWith('payment_intent.')) {
      const intent = event.data.object as Stripe.PaymentIntent;
      const status =
        event.type === 'payment_intent.succeeded'
          ? 'succeeded'
          : event.type === 'payment_intent.payment_failed'
            ? 'failed'
            : event.type === 'payment_intent.canceled'
              ? 'canceled'
              : event.type === 'payment_intent.processing'
                ? 'processing'
                : undefined;
      return {
        id: event.id,
        type: event.type,
        paymentIntentId: intent.id,
        ...(intent.metadata.paymentId
          ? { paymentId: intent.metadata.paymentId }
          : {}),
        amount: intent.amount,
        currency: intent.currency,
        ...(status ? { status } : {}),
      };
    }

    if (event.type === 'charge.refunded') {
      const charge = event.data.object as Stripe.Charge;
      return {
        id: event.id,
        type: event.type,
        ...(typeof charge.payment_intent === 'string'
          ? { paymentIntentId: charge.payment_intent }
          : {}),
        amount: charge.amount,
        amountRefunded: charge.amount_refunded,
        currency: charge.currency,
      };
    }

    return { id: event.id, type: event.type };
  }

  private client() {
    if (!this.stripe) {
      const secret = process.env.STRIPE_SECRET_KEY;
      if (!secret) {
        throw new ServiceUnavailableException(
          'Stripe payments are not configured',
        );
      }
      this.stripe = new Stripe(secret);
    }
    return this.stripe;
  }

  private rethrowProviderError(error: unknown, action: string): never {
    if (error instanceof Stripe.errors.StripeError) {
      throw new ServiceUnavailableException(
        `Payment provider could not ${action}`,
      );
    }
    throw error;
  }
}
