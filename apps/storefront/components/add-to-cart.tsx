'use client';

import { useState } from 'react';
import { useCart } from './providers';
import { type ProductVariant } from '@/lib/api';

export function AddToCart({
  variants,
  productName,
}: {
  variants: ProductVariant[];
  productName: string;
}) {
  const firstAvailable = variants.find((variant) => variant.inStock);
  const [variantId, setVariantId] = useState(
    firstAvailable?.id ?? variants[0]?.id ?? '',
  );
  const [quantity, setQuantity] = useState(1);
  const [pending, setPending] = useState(false);
  const [message, setMessage] = useState('');
  const { addItem } = useCart();
  const selected = variants.find((variant) => variant.id === variantId);

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
      <p aria-live="polite" className="form-message" role="status">
        {message}
      </p>
    </form>
  );
}
