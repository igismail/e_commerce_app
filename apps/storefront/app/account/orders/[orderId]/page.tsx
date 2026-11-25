import { OrderStatus } from '@/components/order-status';

export const metadata = { title: 'Order details' };

export default async function OrderDetailPage({
  params,
}: {
  params: Promise<{ orderId: string }>;
}) {
  const { orderId } = await params;
  return (
    <main className="content-width page-content">
      <OrderStatus orderId={orderId} />
    </main>
  );
}
