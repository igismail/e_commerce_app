'use client';

import Link from 'next/link';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { formatMoney } from '@/lib/api';
import { useAuth } from './providers';

type Order = {
  id: string;
  orderNumber: string;
  status: string;
  currency: string;
  subtotalAmount: number;
  shippingAmount: number;
  taxAmount: number;
  discountAmount: number;
  totalAmount: number;
  createdAt: string;
  shippingAddress: {
    fullName: string;
    line1: string;
    line2?: string;
    city: string;
    region: string;
    postalCode: string;
    countryCode: string;
  };
  items: Array<{
    id: string;
    sku: string;
    productName: string;
    variantName: string;
    unitPriceAmount: number;
    quantity: number;
    lineTotalAmount: number;
  }>;
  payments: Array<{ status: string }>;
};

export function OrderStatus({ orderId }: { orderId: string }) {
  const { session, ready, authorizedApi } = useAuth();
  const queryClient = useQueryClient();
  const [cancelError, setCancelError] = useState('');
  const [cancelling, setCancelling] = useState(false);
  const query = useQuery({
    queryKey: ['order', session?.user.id, orderId],
    queryFn: () => authorizedApi<Order>(`/orders/${encodeURIComponent(orderId)}`),
    enabled: Boolean(session && orderId),
    refetchInterval: (current) =>
      current.state.data?.status === 'PENDING' ? 2500 : false,
  });

  if (!ready) return <p aria-live="polite">Checking your account…</p>;
  if (!session) {
    return (
      <div className="state-card" role="alert">
        <p>Sign in to view this order.</p>
        <Link className="button button-dark" href="/login">
          Sign in
        </Link>
      </div>
    );
  }
  if (query.isLoading) return <p aria-live="polite">Loading order details…</p>;
  if (query.error) {
    return (
      <div className="state-card" role="alert">
        <p>{query.error.message}</p>
        <Link className="text-link" href="/account">
          Return to your account
        </Link>
      </div>
    );
  }
  const order = query.data;
  if (!order) return <p role="alert">Order details are unavailable.</p>;
  const currentOrderId = order.id;

  async function cancelOrder() {
    if (
      !window.confirm(
        'Cancel this order? If payment succeeded, a refund will be requested.',
      )
    ) {
      return;
    }
    setCancelError('');
    setCancelling(true);
    try {
      const updated = await authorizedApi<Order>(
        `/orders/${encodeURIComponent(currentOrderId)}/cancel`,
        { method: 'POST' },
      );
      queryClient.setQueryData(
        ['order', session?.user.id, orderId],
        updated,
      );
      await queryClient.invalidateQueries({ queryKey: ['orders'] });
    } catch (error) {
      setCancelError(
        error instanceof Error ? error.message : 'Could not cancel this order.',
      );
    } finally {
      setCancelling(false);
    }
  }

  return (
    <section className="order-detail">
      <div className="order-confirmation-banner">
        <p className="eyebrow">
          {order.status === 'PENDING'
            ? 'Payment processing'
            : 'Order update'}
        </p>
        <h1>{order.status === 'PAID' ? 'Thank you for your order.' : `Order ${order.status.toLowerCase()}.`}</h1>
        <p>
          Order {order.orderNumber} ·{' '}
          {order.status === 'PENDING'
            ? 'We are waiting for secure payment confirmation.'
            : `Current status: ${order.status.toLowerCase()}.`}
        </p>
      </div>
      <div className="order-detail-grid">
        <section>
          <h2>Items</h2>
          {order.items.map((item) => (
            <div className="summary-row" key={item.id}>
              <span>
                {item.quantity} × {item.productName} · {item.variantName}
              </span>
              <span>{formatMoney(item.lineTotalAmount, order.currency)}</span>
            </div>
          ))}
          <div className="summary-row">
            <span>Subtotal</span>
            <span>{formatMoney(order.subtotalAmount, order.currency)}</span>
          </div>
          {order.discountAmount > 0 ? (
            <div className="summary-row">
              <span>Discount</span>
              <span>−{formatMoney(order.discountAmount, order.currency)}</span>
            </div>
          ) : null}
          <div className="summary-row">
            <span>Shipping</span>
            <span>{formatMoney(order.shippingAmount, order.currency)}</span>
          </div>
          <div className="summary-row">
            <span>Tax</span>
            <span>{formatMoney(order.taxAmount, order.currency)}</span>
          </div>
          <div className="summary-row summary-total">
            <span>Total</span>
            <span>{formatMoney(order.totalAmount, order.currency)}</span>
          </div>
        </section>
        <section>
          <h2>Shipping to</h2>
          <address>
            {order.shippingAddress.fullName}
            <br />
            {order.shippingAddress.line1}
            {order.shippingAddress.line2 ? (
              <>
                <br />
                {order.shippingAddress.line2}
              </>
            ) : null}
            <br />
            {order.shippingAddress.city}, {order.shippingAddress.region}{' '}
            {order.shippingAddress.postalCode}
            <br />
            {order.shippingAddress.countryCode}
          </address>
          <p className="summary-note">
            Payment status: {order.payments[0]?.status ?? 'unknown'}
          </p>
        </section>
      </div>
      {['PENDING', 'PAID', 'PROCESSING'].includes(order.status) ? (
        <div className="order-cancel">
          <button
            className="button button-outline"
            disabled={cancelling}
            onClick={cancelOrder}
            type="button"
          >
            {cancelling ? 'Requesting cancellation…' : 'Cancel order'}
          </button>
          {cancelError ? (
            <p className="form-message" role="alert">
              {cancelError}
            </p>
          ) : null}
        </div>
      ) : null}
      <Link className="text-link" href="/products">
        Continue shopping
      </Link>
    </section>
  );
}
