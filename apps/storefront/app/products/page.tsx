import Link from 'next/link';
import { ProductCard } from '@/components/product-card';
import {
  serverApi,
  type ApiList,
  type Category,
  type Product,
} from '@/lib/api';

export const dynamic = 'force-dynamic';

type SearchParams = Record<string, string | string[] | undefined>;

function first(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] : value;
}

function pageHref(params: SearchParams, page: number) {
  const search = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    const item = first(value);
    if (item && key !== 'page') search.set(key, item);
  }
  search.set('page', String(page));
  return `/products?${search.toString()}`;
}

export default async function ProductsPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  const params = await searchParams;
  const query = new URLSearchParams();
  for (const key of ['q', 'category', 'minPrice', 'maxPrice', 'minRating', 'inStock', 'sort', 'page']) {
    const value = first(params[key]);
    if (value) query.set(key, value);
  }
  query.set('limit', '12');

  const [products, categories] = await Promise.all([
    serverApi<ApiList<Product>>(`/products?${query}`),
    serverApi<ApiList<Category>>('/categories?limit=100'),
  ]);

  return (
    <main className="content-width page-content">
      <div className="page-intro">
        <p className="eyebrow">The collection</p>
        <h1>Everyday, thoughtfully chosen.</h1>
        <p>Well-made pieces, selected for lasting usefulness and quiet detail.</p>
      </div>
      <form action="/products" className="filter-form" method="get">
        <label>
          Search
          <input
            defaultValue={first(params.q) ?? ''}
            maxLength={120}
            name="q"
            placeholder="Search products"
            type="search"
          />
        </label>
        <label>
          Category
          <select defaultValue={first(params.category) ?? ''} name="category">
            <option value="">All categories</option>
            {categories.data.map((category) => (
              <option key={category.id} value={category.slug}>
                {category.name}
              </option>
            ))}
          </select>
        </label>
        <label>
          Sort by
          <select defaultValue={first(params.sort) ?? 'newest'} name="sort">
            <option value="newest">Newest</option>
            <option value="price_asc">Price: low to high</option>
            <option value="price_desc">Price: high to low</option>
            <option value="rating_desc">Top rated</option>
            <option value="name_asc">Name</option>
          </select>
        </label>
        <label>
          Min price (USD cents)
          <input
            defaultValue={first(params.minPrice) ?? ''}
            min="0"
            name="minPrice"
            type="number"
          />
        </label>
        <label>
          Max price (USD cents)
          <input
            defaultValue={first(params.maxPrice) ?? ''}
            min="0"
            name="maxPrice"
            type="number"
          />
        </label>
        <label>
          Minimum rating
          <input
            defaultValue={first(params.minRating) ?? ''}
            max="5"
            min="0"
            name="minRating"
            step="0.1"
            type="number"
          />
        </label>
        <label className="checkbox-filter">
          <input
            defaultChecked={first(params.inStock) === 'true'}
            name="inStock"
            type="checkbox"
            value="true"
          />
          In stock
        </label>
        <button className="button button-dark" type="submit">
          Apply filters
        </button>
      </form>

      <div className="results-heading">
        <p>
          {products.pagination.total}{' '}
          {products.pagination.total === 1 ? 'product' : 'products'}
        </p>
        {first(params.q) || first(params.category) || first(params.inStock) ? (
          <Link className="text-link" href="/products">
            Clear filters
          </Link>
        ) : null}
      </div>
      {products.data.length > 0 ? (
        <div className="product-grid">
          {products.data.map((product) => (
            <ProductCard key={product.id} product={product} />
          ))}
        </div>
      ) : (
        <p className="empty-note">No products match these filters.</p>
      )}
      {products.pagination.totalPages > 1 ? (
        <nav aria-label="Product pages" className="pagination">
          {products.pagination.page > 1 ? (
            <Link href={pageHref(params, products.pagination.page - 1)}>
              Previous
            </Link>
          ) : (
            <span aria-disabled="true">Previous</span>
          )}
          <span>
            Page {products.pagination.page} of {products.pagination.totalPages}
          </span>
          {products.pagination.page < products.pagination.totalPages ? (
            <Link href={pageHref(params, products.pagination.page + 1)}>
              Next
            </Link>
          ) : (
            <span aria-disabled="true">Next</span>
          )}
        </nav>
      ) : null}
    </main>
  );
}
