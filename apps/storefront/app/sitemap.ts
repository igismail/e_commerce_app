import type { MetadataRoute } from 'next';
import { serverApi, type ApiList, type Product } from '@/lib/api';

export const dynamic = 'force-dynamic';

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const baseUrl = process.env.NEXT_PUBLIC_WEB_URL ?? 'http://localhost:3000';
  const products = await serverApi<ApiList<Product>>('/products?limit=100');
  return [
    { url: baseUrl, changeFrequency: 'daily', priority: 1 },
    { url: `${baseUrl}/products`, changeFrequency: 'daily', priority: 0.9 },
    ...products.data.map((product) => ({
      url: `${baseUrl}/products/${encodeURIComponent(product.slug)}`,
      changeFrequency: 'weekly' as const,
      priority: 0.7,
    })),
  ];
}
