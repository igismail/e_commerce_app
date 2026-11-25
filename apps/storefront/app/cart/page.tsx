'use client';

import Link from 'next/link';
import Image from 'next/image';
import { useState } from 'react';
import { CouponForm } from '@/components/coupon-form';
import { useCart } from '@/components/providers';
import { formatMoney, productImageUrl } from '@/lib/api';

function CartLine({
  item,
  updateItem,
  removeItem,
}: {
  item: NonNullable<ReturnType<typeof useCart>['cart']>['items'][number];
  updateItem: (id: string, quantity: number) => Promise<void>;
  removeItem: (id: string) => Promise<void>;
}) {
  const [pending, setPending] = useState(false);
  const [error, setError] = useState('');
  const image = item.variant.product.images[0];

  async function changeQuantity(quantity: number) {
    if (pending) return;
    setPending(true);
    setError('');
    try {
      await updateItem(item.id, quantity);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Could not update item.');
    } finally {
      setPending(false);
    }
  }

  async function remove() {
    if (pending) return;
    setPending(true);
    setError('');
    try {
      await removeItem(item.id);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Could not remove item.');
      setPending(false);
    }
  }

  return (
    <article className="cart-line">
      <Link
        aria-label={`View ${item.variant.product.name}`}
        className="cart-line-image"
        href={`/products/${item.variant.product.slug}`}
      >
        {image ? (
          <Image
            alt={image.altText}
            height={400}
            referrerPolicy="no-referrer"
            sizes="140px"
            src={productImageUrl(image.url)}
            unoptimized
            width={400}
          />
        ) : (
          <span className="image-placeholder">Commerce</span>
        )}
      </Link>
      <div className="cart-line-details">
        <p className="eyebrow">{item.variant.product.category.name}</p>
        <h2>
          <Link href={`/products/${item.variant.product.slug}`}>
            {item.variant.product.name}
          </Link>
        </h2>
        <p>{item.variant.name}</p>
        {!item.variant.inStock ? (
          <p className="form-message" role="status">
            This quantity is no longer available. Adjust it before checkout.
          </p>
        ) : null}
        <div className="cart-line-actions">
          <span>Quantity</span>
          <button
            aria-label={`Decrease ${item.variant.product.name} quantity`}
            className="quantity-button"
            disabled={pending || item.quantity <= 1}
            onClick={() => void changeQuantity(item.quantity - 1)}
            type="button"
          >
            −
          </button>
          <span aria-live="polite">{item.quantity}</span>
          <button
            aria-label={`Increase ${item.variant.product.name} quantity`}
            className="quantity-button"
            disabled={pending || item.quantity >= 99}
            onClick={() => void changeQuantity(item.quantity + 1)}
            type="button"
          >
            +
          </button>
          <button className="text-button" onClick={remove} type="button">
            Remove
          </button>
        </div>
        {error ? (
          <p className="form-message" role="alert">
            {error}
          </p>
        ) : null}
      </div>
      <p className="cart-line-total">{formatMoney(item.lineTotalAmount)}</p>
    </article>
  );
}

export default function CartPage() {
  const { cart, isLoading, error, updateItem, removeItem } = useCart();

  return (
    <main className="content-width page-content">
      <div className="page-intro">
        <p className="eyebrow">Your selection</p>
        <h1>Your bag</h1>
      </div>
      {isLoading ? (
        <p aria-live="polite" className="empty-note">
          Loading your bag…
        </p>
      ) : error ? (
        <div className="state-card" role="alert">
          <p>{error.message}</p>
          <p>Check that the Commerce API is running, then refresh this page.</p>
        </div>
      ) : cart && cart.items.length > 0 ? (
        <div className="cart-layout">
          <section aria-label="Items in your bag" className="cart-lines">
            {cart.items.map((item) => (
              <CartLine
                item={item}
                key={item.id}
                removeItem={removeItem}
                updateItem={updateItem}
              />
            ))}
          </section>
          <aside aria-label="Order summary" className="order-summary">
            <h2>Summary</h2>
            <div className="summary-row">
              <span>Subtotal</span>
              <span>{formatMoney(cart.subtotalAmount)}</span>
            </div>
            {cart.discountAmount > 0 ? (
              <div className="summary-row">
                <span>Discount</span>
                <span>−{formatMoney(cart.discountAmount)}</span>
              </div>
            ) : null}
            <div className="summary-row summary-total">
              <span>Total before shipping and tax</span>
              <span>{formatMoney(cart.totalAmount)}</span>
            </div>
            <CouponForm />
            <Link className="button button-dark checkout-link" href="/checkout">
              Continue to checkout
            </Link>
            <p className="summary-note">
              Shipping and tax are calculated securely at checkout.
            </p>
          </aside>
        </div>
      ) : (
        <section className="empty-cart">
          <p>Your bag is taking a breather.</p>
          <Link className="button button-dark" href="/products">
            Find something useful
          </Link>
        </section>
      )}
    </main>
  );
}
