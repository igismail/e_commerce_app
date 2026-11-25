import Link from 'next/link';
import Image from 'next/image';
import { formatMoney, type Product } from '@/lib/api';

export function ProductCard({ product }: { product: Product }) {
  const image = product.images[0];
  return (
    <article className="product-card">
      <Link
        aria-label={`View ${product.name}`}
        className="product-card-image"
        href={`/products/${product.slug}`}
      >
        {image ? (
          <Image
            alt={image.altText}
            height={1000}
            referrerPolicy="no-referrer"
            sizes="(max-width: 650px) 50vw, (max-width: 900px) 50vw, 25vw"
            src={image.url}
            unoptimized
            width={1000}
          />
        ) : (
          <span aria-hidden="true" className="image-placeholder">
            {product.name}
          </span>
        )}
      </Link>
      <div className="product-card-info">
        <div>
          <p className="eyebrow">{product.category.name}</p>
          <h2>
            <Link href={`/products/${product.slug}`}>{product.name}</Link>
          </h2>
        </div>
        <p className="product-card-price">
          {product.priceRange
            ? formatMoney(product.priceRange.min)
            : 'Unavailable'}
        </p>
      </div>
      <p className="rating">
        {product.ratingCount > 0
          ? `${product.ratingAverage.toFixed(1)} · ${product.ratingCount} reviews`
          : 'New arrival'}
      </p>
    </article>
  );
}
