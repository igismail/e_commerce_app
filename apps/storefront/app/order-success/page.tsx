import { OrderStatus } from '@/components/order-status';

export const metadata = { title: 'Order status' };

export default async function OrderSuccessPage({
  searchParams,
}: {
  searchParams: Promise<{ orderId?: string }>;
}) {
  const { orderId } = await searchParams;
  if (!orderId || !/^[A-Za-z0-9_-]{1,64}$/.test(orderId)) {
    return (
      <main className="content-width page-content">
        <div className="state-card" role="alert">
          <p>Order details could not be found.</p>
        </div>
      </main>
    );
  }
  return (
    <main className="content-width page-content">
      <OrderStatus orderId={orderId} />
    </main>
  );
}
