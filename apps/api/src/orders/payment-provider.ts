export const PAYMENT_PROVIDER = Symbol('PAYMENT_PROVIDER');

export interface CreatePaymentIntentInput {
  orderId: string;
  paymentId: string;
  amount: number;
  currency: string;
  customerEmail: string;
  idempotencyKey: string;
}

export interface PaymentIntentSession {
  id: string;
  clientSecret: string;
}

export interface PaymentProviderEvent {
  id: string;
  type: string;
  paymentId?: string;
  paymentIntentId?: string;
  status?: 'processing' | 'succeeded' | 'failed' | 'canceled';
  amount?: number;
  amountRefunded?: number;
  currency?: string;
}

export interface PaymentProvider {
  createPaymentIntent(
    input: CreatePaymentIntentInput,
  ): Promise<PaymentIntentSession>;
  cancelPaymentIntent(
    id: string,
    idempotencyKey: string,
  ): Promise<{ status: string }>;
  refundPaymentIntent(
    id: string,
    idempotencyKey: string,
  ): Promise<{ id: string; status: string; amount: number }>;
  verifyWebhook(rawBody: Buffer, signature: string): PaymentProviderEvent;
}
