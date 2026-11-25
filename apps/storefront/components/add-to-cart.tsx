'use client';

import { useQuery, useQueryClient } from '@tanstack/react-query';
import Link from 'next/link';
import { useState } from 'react';
import { useAuth, useCart } from './providers';
import { type ProductVariant } from '@/lib/api';

export function AddToCart({
  variants,
  productName,
  productSlug,
}: {
  variants: ProductVariant[];
  productName: string;
  productSlug: string;
}) {
  const firstAvailable = variants.find((variant) => variant.inStock);
  const [variantId, setVariantId] = useState(
    firstAvailable?.id ?? variants[0]?.id ?? '',
  );
  const [quantity, setQuantity] = useState(1);
  const [pending, setPending] = useState(false);
  const [wishlistPending, setWishlistPending] = useState(false);
  const [message, setMessage] = useState('');
  const [wishlistMessage, setWishlistMessage] = useState('');
  const { addItem } = useCart();
  const {
    session,
    ready,
    listWishlist,
    addWishlistItem,
    deleteWishlistItem,
  } = useAuth();
  const queryClient = useQueryClient();
  const wishlist = useQuery({
    queryKey: ['wishlist', session?.user.id],
    queryFn: () => listWishlist({ limit: 100 }),
    enabled: Boolean(session),
  });
  const selected = variants.find((variant) => variant.id === variantId);
  const savedItem = wishlist.data?.data.find(
    (item) => item.variantId === selected?.id,
  );

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!selected?.inStock || pending) return;
    setPending(true);
    setMessage('');
    try {
      await addItem(variantId, quantity);
      setMessage(`${productName} added to your bag.`);
    } catch (error) {
      setMessage(
        error instanceof Error ? error.message : 'Could not add this item.',
      );
    } finally {
      setPending(false);
    }
  }

  async function toggleWishlist() {
    if (!selected || wishlistPending) return;
    setWishlistPending(true);
    setWishlistMessage('');
    try {
      if (savedItem) {
        await deleteWishlistItem(savedItem.id);
        setWishlistMessage('Removed from your wishlist.');
      } else {
        await addWishlistItem(selected.id);
        setWishlistMessage('Saved to your wishlist.');
      }
      await queryClient.invalidateQueries({
        queryKey: ['wishlist', session?.user.id],
      });
    } catch (error) {
      setWishlistMessage(
        error instanceof Error ? error.message : 'Could not update wishlist.',
      );
    } finally {
      setWishlistPending(false);
    }
  }

  return (
    <form className="purchase-form" onSubmit={submit}>
      <label htmlFor="product-variant">Option</label>
      <select
        id="product-variant"
        onChange={(event) => setVariantId(event.target.value)}
        value={variantId}
      >
        {variants.map((variant) => (
          <option disabled={!variant.inStock} key={variant.id} value={variant.id}>
            {variant.name}
            {variant.inStock ? '' : ' — out of stock'}
          </option>
        ))}
      </select>
      <label htmlFor="product-quantity">Quantity</label>
      <input
        id="product-quantity"
        max={99}
        min={1}
        onChange={(event) => setQuantity(Number(event.target.value))}
        type="number"
        value={quantity}
      />
      <button
        className="button button-dark"
        disabled={!selected?.inStock || pending}
        type="submit"
      >
        {pending ? 'Adding…' : selected?.inStock ? 'Add to bag' : 'Out of stock'}
      </button>
      {session ? (
        <button
          className="button button-outline"
          disabled={!selected || wishlistPending || wishlist.isLoading}
          onClick={() => void toggleWishlist()}
          type="button"
        >
          {wishlistPending
            ? 'Updating wishlist…'
            : savedItem
              ? 'Remove from wishlist'
              : 'Save to wishlist'}
        </button>
      ) : ready ? (
        <Link
          className="button button-outline"
          href={`/login?next=${encodeURIComponent(`/products/${productSlug}`)}`}
        >
          Sign in to save
        </Link>
      ) : null}
      {wishlist.error ? (
        <p className="form-message" role="status">
          Wishlist could not be loaded.
        </p>
      ) : null}
      <p aria-live="polite" className="form-message" role="status">
        {wishlistMessage}
      </p>
      <p aria-live="polite" className="form-message" role="status">
        {message}
      </p>
    </form>
  );
}
