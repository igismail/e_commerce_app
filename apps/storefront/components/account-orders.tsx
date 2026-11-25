'use client';

import Link from 'next/link';
import { useQuery } from '@tanstack/react-query';
import { useAuth } from './providers';
import { formatMoney } from '@/lib/api';

type OrderSummary = {
  id: string;
  orderNumber: string;
  status: string;
  currency: string;
  totalAmount: number;
  createdAt: string;
};

type OrderList = {
  data: OrderSummary[];
  pagination: { total: number };
};

export function AccountOrders() {
  const { session, ready, authorizedApi } = useAuth();
  const orders = useQuery({
    queryKey: ['orders', session?.user.id],
    queryFn: () => authorizedApi<OrderList>('/orders?page=1&limit=20'),
    enabled: Boolean(session),
  });

  if (!ready) return <p aria-live="polite">Checking your account…</p>;
  if (!session) {
    return (
      <div className="state-card">
        <p>Sign in to see your orders and account details.</p>
        <Link className="button button-dark" href="/login">
          Sign in
        </Link>
      </div>
    );
  }
  if (orders.isLoading) return <p aria-live="polite">Loading your orders…</p>;
  if (orders.error) {
    return (
      <p className="form-message" role="alert">
        {orders.error.message}
      </p>
    );
  }
  if (!orders.data?.data.length) {
    return (
      <div className="empty-cart">
        <p>Your order history is just getting started.</p>
        <Link className="button button-dark" href="/products">
          Explore the collection
        </Link>
      </div>
    );
  }

  return (
    <div className="account-orders">
      {orders.data.data.map((order) => (
        <article className="account-order" key={order.id}>
          <div>
            <p className="eyebrow">{order.orderNumber}</p>
            <p>
              {new Intl.DateTimeFormat('en', { dateStyle: 'medium' }).format(
                new Date(order.createdAt),
              )}
            </p>
          </div>
          <p className={`order-status order-status-${order.status.toLowerCase()}`}>
            {order.status}
          </p>
          <p>{formatMoney(order.totalAmount, order.currency)}</p>
          <Link className="text-link" href={`/account/orders/${order.id}`}>
            View order
          </Link>
        </article>
      ))}
    </div>
  );
}
