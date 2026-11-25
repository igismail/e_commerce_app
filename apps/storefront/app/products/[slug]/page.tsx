import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { AddToCart } from '@/components/add-to-cart';
import { ProductGallery } from '@/components/product-gallery';
import { ApiError, formatMoney, serverApi, type Product } from '@/lib/api';

export const dynamic = 'force-dynamic';

type Review = {
  id: string;
  rating: number;
  title: string | null;
  body: string;
  createdAt: string;
  user: { firstName: string };
};

type ReviewList = {
  data: Review[];
  pagination: { total: number };
};

async function loadProduct(slug: string) {
  try {
    return await serverApi<Product>(`/products/${encodeURIComponent(slug)}`);
  } catch (error) {
    if (error instanceof ApiError && error.status === 404) notFound();
    throw error;
  }
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const { slug } = await params;
  const product = await loadProduct(slug);
  return {
    title: product.name,
    description: product.description?.slice(0, 160),
    openGraph: {
      title: product.name,
      description: product.description?.slice(0, 160),
      images: product.images[0]?.url ? [product.images[0].url] : [],
    },
  };
}

export default async function ProductPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const product = await loadProduct(slug);
  const reviews = await serverApi<ReviewList>(
    `/products/${encodeURIComponent(slug)}/reviews?limit=8&sort=newest`,
  );
  return (
    <main className="content-width page-content">
      <nav aria-label="Breadcrumb" className="breadcrumbs">
        <Link href="/products">Shop</Link>
        <span aria-hidden="true">/</span>
        <Link href={`/products?category=${encodeURIComponent(product.category.slug)}`}>
          {product.category.name}
        </Link>
        <span aria-hidden="true">/</span>
        <span aria-current="page">{product.name}</span>
      </nav>
      <section className="product-detail">
        <ProductGallery images={product.images} productName={product.name} />
        <div className="product-detail-copy">
          <p className="eyebrow">{product.brand ?? product.category.name}</p>
          <h1>{product.name}</h1>
          <p className="detail-rating">
            {product.ratingCount > 0
              ? `${product.ratingAverage.toFixed(1)} out of 5 · ${product.ratingCount} reviews`
              : 'No reviews yet'}
          </p>
          <p className="detail-price">
            {product.priceRange
              ? product.priceRange.min === product.priceRange.max
                ? formatMoney(product.priceRange.min)
                : `${formatMoney(product.priceRange.min)} – ${formatMoney(product.priceRange.max)}`
              : 'Unavailable'}
          </p>
          <p className="detail-description">{product.description}</p>
          <p className={product.inStock ? 'stock-status' : 'stock-status out'}>
            {product.inStock ? 'In stock and ready to ship' : 'Currently out of stock'}
          </p>
          <AddToCart productName={product.name} variants={product.variants} />
        </div>
      </section>

      <section aria-labelledby="reviews-title" className="reviews-section">
        <div className="section-heading">
          <div>
            <p className="eyebrow">From the community</p>
            <h2 id="reviews-title">Reviews</h2>
          </div>
          <span>{reviews.pagination.total} total</span>
        </div>
        {reviews.data.length > 0 ? (
          <div className="review-grid">
            {reviews.data.map((review) => (
              <article className="review-card" key={review.id}>
                <p className="review-rating" aria-label={`${review.rating} out of 5 stars`}>
                  {'★'.repeat(review.rating)}
                  {'☆'.repeat(5 - review.rating)}
                </p>
                {review.title ? <h3>{review.title}</h3> : null}
                <p>{review.body}</p>
                <p className="review-byline">
                  {review.user.firstName} ·{' '}
                  {new Intl.DateTimeFormat('en', {
                    dateStyle: 'medium',
                  }).format(new Date(review.createdAt))}
                </p>
              </article>
            ))}
          </div>
        ) : (
          <p className="empty-note">Be the first to share a review.</p>
        )}
      </section>
    </main>
  );
}
