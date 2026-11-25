'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import { useForm } from 'react-hook-form';
import { z } from 'zod';
import { useCart } from './providers';

const couponSchema = z.object({
  code: z
    .string()
    .trim()
    .min(1, 'Enter a coupon code.')
    .max(64, 'Coupon codes can be at most 64 characters.'),
});

type CouponValues = z.infer<typeof couponSchema>;

export function CouponForm() {
  const { cart, applyCoupon, removeCoupon } = useCart();
  const form = useForm<CouponValues>({
    resolver: zodResolver(couponSchema),
    defaultValues: { code: '' },
  });

  async function submit(values: CouponValues) {
    try {
      await applyCoupon(values.code);
      form.reset();
      form.clearErrors('root');
    } catch (error) {
      form.setError('root', {
        message:
          error instanceof Error ? error.message : 'Could not apply coupon.',
      });
    }
  }

  async function clearCoupon() {
    try {
      await removeCoupon();
      form.clearErrors('root');
    } catch (error) {
      form.setError('root', {
        message:
          error instanceof Error ? error.message : 'Could not remove coupon.',
      });
    }
  }

  return (
    <section aria-labelledby="coupon-heading" className="coupon-panel">
      <h2 id="coupon-heading">Discount code</h2>
      {cart?.coupon?.valid ? (
        <div className="applied-coupon">
          <p>
            <strong>{cart.coupon.code}</strong> applied
          </p>
          <button className="text-button" onClick={clearCoupon} type="button">
            Remove
          </button>
        </div>
      ) : (
        <form className="coupon-form" onSubmit={form.handleSubmit(submit)}>
          <label className="visually-hidden" htmlFor="coupon-code">
            Coupon code
          </label>
          <input
            autoComplete="off"
            id="coupon-code"
            maxLength={64}
            placeholder="Enter code"
            {...form.register('code')}
          />
          <button
            className="button button-outline"
            disabled={form.formState.isSubmitting}
            type="submit"
          >
            {form.formState.isSubmitting ? 'Applying…' : 'Apply'}
          </button>
        </form>
      )}
      {form.formState.errors.code ? (
        <p className="form-message" role="alert">
          {form.formState.errors.code.message}
        </p>
      ) : null}
      {form.formState.errors.root ? (
        <p className="form-message" role="alert">
          {form.formState.errors.root.message}
        </p>
      ) : null}
      {cart?.coupon && !cart.coupon.valid ? (
        <p className="form-message" role="status">
          {cart.coupon.reason}
        </p>
      ) : null}
    </section>
  );
}
