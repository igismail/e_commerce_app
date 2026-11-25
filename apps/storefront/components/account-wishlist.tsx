'use client';

import Image from 'next/image';
import Link from 'next/link';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { formatMoney, productImageUrl } from '@/lib/api';
import { useAuth, useCart } from './providers';

export function AccountWishlist() {
  const {
    session,
    ready,
    listWishlist,
    deleteWishlistItem,
  } = useAuth();
  const { addItem } = useCart();
  const queryClient = useQueryClient();
  const [pendingId, setPendingId] = useState('');
  const [message, setMessage] = useState('');
  const [messageIsError, setMessageIsError] = useState(false);
  const queryKey = ['wishlist', session?.user.id];
  const wishlist = useQuery({
    queryKey,
    queryFn: () => listWishlist({ limit: 100 }),
    enabled: Boolean(session),
  });

  async function removeItem(itemId: string) {
    setPendingId(itemId);
    setMessage('');
    setMessageIsError(false);
    try {
      await deleteWishlistItem(itemId);
      await queryClient.invalidateQueries({ queryKey });
      setMessage('Item removed from your wishlist.');
    } catch (error) {
      setMessageIsError(true);
      setMessage(
        error instanceof Error ? error.message : 'Could not remove this item.',
      );
    } finally {
      setPendingId('');
    }
  }

  async function addItemToCart(variantId: string) {
    setPendingId(variantId);
    setMessage('');
    setMessageIsError(false);
    try {
      await addItem(variantId);
      setMessage('Item added to your bag.');
    } catch (error) {
      setMessageIsError(true);
      setMessage(
        error instanceof Error ? error.message : 'Could not add this item.',
      );
    } finally {
      setPendingId('');
    }
  }

  if (!ready) return <p aria-live="polite">Checking your account…</p>;
  if (!session) {
    return (
      <div className="state-card">
        <p>Sign in to see the products you have saved.</p>
        <Link
          className="button button-dark"
          href={`/login?next=${encodeURIComponent('/account/wishlist')}`}
        >
          Sign in
        </Link>
      </div>
    );
  }
  if (wishlist.isLoading) {
    return <p aria-live="polite">Loading your wishlist…</p>;
  }
  if (wishlist.error) {
    return (
      <p className="form-message" role="alert">
        {wishlist.error.message}
      </p>
    );
  }
  if (!wishlist.data?.data.length) {
    return (
      <div className="empty-note">
        <p>Your wishlist is empty.</p>
        <Link className="button button-outline" href="/products">
          Browse products
        </Link>
      </div>
    );
  }

  return (
    <>
      {message ? (
        <p
          className={messageIsError ? 'form-message' : 'success-message'}
          role={messageIsError ? 'alert' : 'status'}
        >
          {message}
        </p>
      ) : null}
      <div className="product-grid">
        {wishlist.data.data.map((item) => {
          const itemPending =
            pendingId === item.id || pendingId === item.variantId;
          const image = item.product.images[0];
          return (
            <article className="product-card" key={item.id}>
              <Link
                aria-label={`View ${item.product.name}`}
                className="product-card-image"
                href={`/products/${item.product.slug}`}
              >
                {image ? (
                  <Image
                    alt={image.altText}
                    height={1000}
                    sizes="(max-width: 650px) 50vw, 25vw"
                    src={productImageUrl(image.url)}
                    unoptimized
                    width={1000}
                  />
                ) : (
                  <span className="image-placeholder">{item.product.name}</span>
                )}
              </Link>
              <div className="product-card-info">
                <div>
                  <p className="eyebrow">{item.product.category.name}</p>
                  <h2>
                    <Link href={`/products/${item.product.slug}`}>
                      {item.product.name}
                    </Link>
                  </h2>
                </div>
                <p className="product-card-price">
                  {formatMoney(item.priceAmount)}
                </p>
              </div>
              <p className="summary-note">{item.variantName}</p>
              <div className="address-form-actions">
                <button
                  className="button button-dark"
                  disabled={!item.inStock || itemPending}
                  onClick={() => void addItemToCart(item.variantId)}
                  type="button"
                >
                  {itemPending ? 'Working…' : item.inStock ? 'Add to bag' : 'Out of stock'}
                </button>
                <button
                  className="text-button"
                  disabled={itemPending}
                  onClick={() => void removeItem(item.id)}
                  type="button"
                >
                  Remove
                </button>
              </div>
            </article>
          );
        })}
      </div>
    </>
  );
}
