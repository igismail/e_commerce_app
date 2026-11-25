import Link from 'next/link';
import { ProductCard } from '@/components/product-card';
import {
  serverApi,
  type ApiList,
  type Category,
  type Product,
} from '@/lib/api';

export const dynamic = 'force-dynamic';

export default async function HomePage() {
  const [categories, featured] = await Promise.all([
    serverApi<ApiList<Category>>('/categories?limit=8'),
    serverApi<ApiList<Product>>('/products?limit=4&sort=rating_desc'),
  ]);

  return (
    <main>
      <section className="hero content-width">
        <div>
          <p className="eyebrow">Better things, made to last</p>
          <h1>A little more thought in the things we choose.</h1>
        </div>
        <div className="hero-copy">
          <p>
            Discover useful, well-made pieces for your everyday. Thoughtful
            materials, enduring design, and the details that make a difference.
          </p>
          <Link className="text-link" href="/products">
            Explore the collection <span aria-hidden="true">↗</span>
          </Link>
        </div>
      </section>

      <section aria-labelledby="category-title" className="content-width section">
        <div className="section-heading">
          <div>
            <p className="eyebrow">Find your everyday</p>
            <h2 id="category-title">Shop by category</h2>
          </div>
          <Link className="text-link" href="/products">
            View all products
          </Link>
        </div>
        <div className="category-grid">
          {categories.data.map((category, index) => (
            <Link
              className={`category-tile category-tone-${index % 4}`}
              href={`/products?category=${encodeURIComponent(category.slug)}`}
              key={category.id}
            >
              <span className="category-index">
                {String(index + 1).padStart(2, '0')}
              </span>
              <span className="category-name">{category.name}</span>
              <span className="category-count">
                {category.productCount} products
              </span>
            </Link>
          ))}
        </div>
      </section>

      <section aria-labelledby="featured-title" className="content-width section">
        <div className="section-heading">
          <div>
            <p className="eyebrow">Considered essentials</p>
            <h2 id="featured-title">A few good things</h2>
          </div>
          <Link className="text-link" href="/products?sort=rating_desc">
            Browse the collection
          </Link>
        </div>
        {featured.data.length > 0 ? (
          <div className="product-grid">
            {featured.data.map((product) => (
              <ProductCard key={product.id} product={product} />
            ))}
          </div>
        ) : (
          <p className="empty-note">There are no featured products right now.</p>
        )}
      </section>

      <section className="about-band" id="about">
        <div className="content-width about-content">
          <div>
            <p className="eyebrow">The Commerce standard</p>
            <h2>Useful by design. Considered in every detail.</h2>
          </div>
          <p>
            We believe the best everyday things earn their place. We look for
            honest materials, responsible makers, and timeless utility.
          </p>
        </div>
      </section>
      <footer className="site-footer content-width">
        <span>© {new Date().getFullYear()} Commerce</span>
        <span>Thoughtful goods for everyday life.</span>
      </footer>
    </main>
  );
}
