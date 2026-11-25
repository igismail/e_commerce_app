'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import {
  Elements,
  PaymentElement,
  useElements,
  useStripe,
} from '@stripe/react-stripe-js';
import { loadStripe } from '@stripe/stripe-js';
import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { useForm } from 'react-hook-form';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { z } from 'zod';
import { formatMoney } from '@/lib/api';
import { useAuth, useCart } from './providers';

const addressSchema = z.object({
  fullName: z.string().trim().min(2).max(120),
  phone: z.string().trim().max(32).optional(),
  line1: z.string().trim().min(3).max(160),
  line2: z.string().trim().max(160).optional(),
  city: z.string().trim().min(2).max(100),
  region: z.string().trim().min(2).max(100),
  postalCode: z.string().trim().min(2).max(24),
  countryCode: z.string().trim().regex(/^[A-Za-z]{2}$/, 'Use a two-letter country code.'),
  shippingMethod: z.enum(['STANDARD', 'EXPRESS']),
});

type AddressValues = z.infer<typeof addressSchema>;
type CheckoutResult = {
  order: {
    id: string;
    orderNumber: string;
    currency: string;
    totalAmount: number;
    shippingAmount: number;
    taxAmount: number;
    reservationExpiresAt: string | null;
  };
  payment: { clientSecret: string };
};

const stripeKey = process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY;
const stripePromise = stripeKey ? loadStripe(stripeKey) : null;

function PaymentConfirmation({
  checkout,
}: {
  checkout: CheckoutResult;
}) {
  const stripe = useStripe();
  const elements = useElements();
  const router = useRouter();
  const [error, setError] = useState('');
  const [pending, setPending] = useState(false);

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!stripe || !elements || pending) return;
    setPending(true);
    setError('');
    try {
      const result = await stripe.confirmPayment({
        elements,
        confirmParams: {
          return_url: `${window.location.origin}/order-success?orderId=${encodeURIComponent(checkout.order.id)}`,
        },
        redirect: 'if_required',
      });
      if (result.error) {
        setError(result.error.message ?? 'Payment could not be confirmed.');
        return;
      }
      router.replace(
        `/order-success?orderId=${encodeURIComponent(checkout.order.id)}`,
      );
      router.refresh();
    } catch (reason) {
      setError(
        reason instanceof Error ? reason.message : 'Payment could not be confirmed.',
      );
    } finally {
      setPending(false);
    }
  }

  return (
    <form className="payment-panel" onSubmit={submit}>
      <h2>Payment</h2>
      <p className="summary-note">
        Your payment is encrypted and processed securely by Stripe.
      </p>
      <PaymentElement />
      {error ? (
        <p className="form-message" role="alert">
          {error}
        </p>
      ) : null}
      <button
        className="button button-dark"
        disabled={!stripe || !elements || pending}
        type="submit"
      >
        {pending
          ? 'Confirming payment…'
          : `Pay ${formatMoney(checkout.order.totalAmount, checkout.order.currency)}`}
      </button>
    </form>
  );
}

export function CheckoutForm() {
  const { authorizedApi, session } = useAuth();
  const { cart, isLoading: cartLoading } = useCart();
  const queryClient = useQueryClient();
  const [checkout, setCheckout] = useState<CheckoutResult | null>(null);
  const [idempotencyKey, setIdempotencyKey] = useState('');
  const [requestError, setRequestError] = useState('');
  const form = useForm<AddressValues>({
    resolver: zodResolver(addressSchema),
    defaultValues: {
      fullName: '',
      phone: '',
      line1: '',
      line2: '',
      city: '',
      region: '',
      postalCode: '',
      countryCode: 'US',
      shippingMethod: 'STANDARD',
    },
  });
  const savedAddresses = useQuery({
    queryKey: ['addresses', session?.user.id],
    queryFn: () =>
      authorizedApi<
        Array<
          Pick<
            AddressValues,
            | 'fullName'
            | 'phone'
            | 'line1'
            | 'line2'
            | 'city'
            | 'region'
            | 'postalCode'
            | 'countryCode'
          > & { isDefault: boolean }
        >
      >('/users/me/addresses'),
    enabled: Boolean(session),
  });

  useEffect(() => {
    setIdempotencyKey(crypto.randomUUID());
  }, []);

  useEffect(() => {
    const defaultAddress = savedAddresses.data?.find(
      (address) => address.isDefault,
    );
    if (defaultAddress && !form.getValues('fullName')) {
      form.reset({
        ...defaultAddress,
        phone: defaultAddress.phone ?? '',
        line2: defaultAddress.line2 ?? '',
        shippingMethod: form.getValues('shippingMethod'),
      });
    }
  }, [form, savedAddresses.data]);

  async function createCheckout(values: AddressValues) {
    if (!idempotencyKey || !cart?.items.length) return;
    setRequestError('');
    if (!stripePromise) {
      setRequestError(
        'Online payment is not configured. Please contact the store before placing an order.',
      );
      return;
    }
    try {
      const result = await authorizedApi<CheckoutResult>('/checkout', {
        method: 'POST',
        headers: { 'Idempotency-Key': idempotencyKey },
        body: JSON.stringify({
          shippingAddress: {
            fullName: values.fullName,
            phone: values.phone || undefined,
            line1: values.line1,
            line2: values.line2 || undefined,
            city: values.city,
            region: values.region,
            postalCode: values.postalCode,
            countryCode: values.countryCode.toUpperCase(),
          },
          shippingMethod: values.shippingMethod,
        }),
      });
      setCheckout(result);
      await queryClient.invalidateQueries({ queryKey: ['cart'] });
    } catch (error) {
      setRequestError(
        error instanceof Error ? error.message : 'Could not start checkout.',
      );
    }
  }

  if (cartLoading) {
    return <p aria-live="polite">Loading your order…</p>;
  }
  if (!cart?.items.length && !checkout) {
    return (
      <div className="empty-cart">
        <p>Your bag is empty.</p>
        <a className="button button-dark" href="/products">
          Return to the collection
        </a>
      </div>
    );
  }
  if (checkout) {
    return (
      <section className="checkout-created">
        <p className="eyebrow">Order {checkout.order.orderNumber}</p>
        <h2>Shipping confirmed</h2>
        <p>
          Shipping {formatMoney(checkout.order.shippingAmount, checkout.order.currency)}
          {' · '}Tax {formatMoney(checkout.order.taxAmount, checkout.order.currency)}
        </p>
        {stripePromise ? (
          <Elements
            options={{ clientSecret: checkout.payment.clientSecret }}
            stripe={stripePromise}
          >
            <PaymentConfirmation checkout={checkout} />
          </Elements>
        ) : (
          <p className="form-message" role="alert">
            Online payment is not configured. Please contact the store before
            placing an order.
          </p>
        )}
      </section>
    );
  }

  return (
    <form className="checkout-form" onSubmit={form.handleSubmit(createCheckout)}>
      <section>
        <h2>Shipping address</h2>
        {savedAddresses.data?.length ? (
          <p className="summary-note">
            Your default saved address has been filled in. You can edit it for
            this order or manage addresses in your account.
          </p>
        ) : null}
        {savedAddresses.error ? (
          <p className="summary-note" role="status">
            Saved addresses could not be loaded; enter your shipping details
            below.
          </p>
        ) : null}
        <div className="form-row">
          <label>
            Full name
            <input autoComplete="name" {...form.register('fullName')} />
          </label>
          <label>
            Phone (optional)
            <input autoComplete="tel" {...form.register('phone')} />
          </label>
        </div>
        <label>
          Address
          <input autoComplete="address-line1" {...form.register('line1')} />
        </label>
        <label>
          Apartment, suite, etc. (optional)
          <input autoComplete="address-line2" {...form.register('line2')} />
        </label>
        <div className="form-row">
          <label>
            City
            <input autoComplete="address-level2" {...form.register('city')} />
          </label>
          <label>
            State / region
            <input autoComplete="address-level1" {...form.register('region')} />
          </label>
        </div>
        <div className="form-row">
          <label>
            Postal code
            <input autoComplete="postal-code" {...form.register('postalCode')} />
          </label>
          <label>
            Country code
            <input
              autoComplete="country"
              maxLength={2}
              {...form.register('countryCode')}
            />
          </label>
        </div>
        <label>
          Shipping method
          <select {...form.register('shippingMethod')}>
            <option value="STANDARD">Standard</option>
            <option value="EXPRESS">Express</option>
          </select>
        </label>
      </section>
      <section className="checkout-summary">
        <h2>Order summary</h2>
        {cart?.items.map((item) => (
          <div className="summary-row" key={item.id}>
            <span>
              {item.quantity} × {item.variant.product.name}
            </span>
            <span>{formatMoney(item.lineTotalAmount)}</span>
          </div>
        ))}
        <div className="summary-row summary-total">
          <span>Subtotal after discounts</span>
          <span>{formatMoney(cart?.totalAmount ?? 0)}</span>
        </div>
        <p className="summary-note">
          Shipping and tax are calculated by the store before payment.
        </p>
      </section>
      {requestError ? (
        <p className="form-message" role="alert">
          {requestError}
        </p>
      ) : null}
      {Object.entries(form.formState.errors).some(
        ([field]) => field !== 'root',
      ) ? (
        <ul className="form-message" role="alert">
          {Object.entries(form.formState.errors).map(([field, error]) =>
            field !== 'root' && error?.message ? (
              <li key={field}>
                {field.replace(/([A-Z])/g, ' $1')}: {error.message}
              </li>
            ) : null,
          )}
        </ul>
      ) : null}
      <button
        className="button button-dark"
        disabled={form.formState.isSubmitting || !idempotencyKey}
        type="submit"
      >
        {form.formState.isSubmitting ? 'Preparing secure payment…' : 'Continue to payment'}
      </button>
    </form>
  );
}
