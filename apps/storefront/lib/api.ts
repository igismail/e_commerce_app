import { createClient } from './generated/client';
import {
  usersControllerAddWishlistItem,
  usersControllerDeleteWishlistItem,
  usersControllerListWishlist,
} from './generated/sdk.gen';
import type {
  UsersControllerListWishlistData,
  WishlistResponseDto,
} from './generated/types.gen';

export type Pagination = {
  page: number;
  limit: number;
  total: number;
  totalPages: number;
};

export type ApiList<T> = {
  data: T[];
  pagination: Pagination;
};

export type Category = {
  id: string;
  name: string;
  slug: string;
  productCount: number;
};

export type ProductImage = {
  id: string;
  url: string;
  altText: string;
  sortOrder: number;
};

export type ProductVariant = {
  id: string;
  sku: string;
  name: string;
  optionValues: Record<string, string>;
  priceAmount: number;
  compareAtAmount: number | null;
  inStock: boolean;
};

export type Product = {
  id: string;
  name: string;
  slug: string;
  description?: string;
  brand: string | null;
  ratingAverage: number;
  ratingCount: number;
  category: Pick<Category, 'id' | 'name' | 'slug'>;
  images: ProductImage[];
  variants: ProductVariant[];
  priceRange: { min: number; max: number } | null;
  inStock: boolean;
};

export type CouponQuote = {
  code: string;
  valid: boolean;
  discountAmount: number;
  reason?: string;
};

export type CartItem = {
  id: string;
  quantity: number;
  unitPriceAmount: number;
  lineTotalAmount: number;
  variant: ProductVariant & {
    product: Pick<Product, 'id' | 'name' | 'slug' | 'brand' | 'category'> & {
      images: ProductImage[];
    };
  };
};

export type Cart = {
  id: string;
  items: CartItem[];
  coupon: CouponQuote | null;
  subtotalAmount: number;
  discountAmount: number;
  totalAmount: number;
};

export class ApiError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

export type WishlistQuery = NonNullable<UsersControllerListWishlistData['query']>;

function createAuthenticatedApiClient(accessToken: string, csrfToken: string) {
  return createClient({
    baseUrl:
      process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3001/api/v1',
    auth: accessToken,
    credentials: 'include',
    headers: { 'x-csrf-token': csrfToken },
  });
}

function generatedErrorMessage(error: unknown) {
  if (typeof error === 'string') return error;
  if (typeof error === 'object' && error !== null && 'message' in error) {
    const message = error.message;
    if (typeof message === 'string') return message;
    if (Array.isArray(message)) return message.join(', ');
  }
  return 'The API request failed.';
}

function unwrapGeneratedResponse<T>(result: {
  data?: T;
  error?: unknown;
  response?: Response;
}): T {
  if (result.error !== undefined) {
    throw new ApiError(
      generatedErrorMessage(result.error),
      result.response?.status ?? 500,
    );
  }
  if (result.data === undefined) {
    throw new ApiError('The API returned no response data.', 502);
  }
  return result.data;
}

export async function listWishlist(
  accessToken: string,
  csrfToken: string,
  query: WishlistQuery = {},
) {
  const result = await usersControllerListWishlist({
    client: createAuthenticatedApiClient(accessToken, csrfToken),
    query,
  });
  return unwrapGeneratedResponse<WishlistResponseDto>(result);
}

export async function addWishlistItem(
  accessToken: string,
  csrfToken: string,
  variantId: string,
) {
  const result = await usersControllerAddWishlistItem({
    client: createAuthenticatedApiClient(accessToken, csrfToken),
    body: { variantId },
  });
  return unwrapGeneratedResponse<WishlistResponseDto>(result);
}

export async function deleteWishlistItem(
  accessToken: string,
  csrfToken: string,
  itemId: string,
) {
  const result = await usersControllerDeleteWishlistItem({
    client: createAuthenticatedApiClient(accessToken, csrfToken),
    path: { itemId },
  });
  if (result.error !== undefined) {
    throw new ApiError(
      generatedErrorMessage(result.error),
      result.response?.status ?? 500,
    );
  }
}

function apiBaseUrl() {
  return (
    process.env.API_INTERNAL_URL ??
    process.env.NEXT_PUBLIC_API_URL ??
    'http://localhost:3001/api/v1'
  ).replace(/\/$/, '');
}

async function responseError(response: Response) {
  let message = `Request failed (${response.status})`;
  try {
    const body = (await response.json()) as {
      message?: string | string[];
    };
    if (typeof body.message === 'string') {
      message = body.message;
    } else if (Array.isArray(body.message)) {
      message = body.message.join(', ');
    }
  } catch {
    // Keep the HTTP status message when the server does not return JSON.
  }
  return new ApiError(message, response.status);
}

export async function serverApi<T>(path: string): Promise<T> {
  const response = await fetch(`${apiBaseUrl()}${path}`, {
    cache: 'no-store',
    headers: { Accept: 'application/json' },
  });
  if (!response.ok) {
    throw await responseError(response);
  }
  return (await response.json()) as T;
}

export async function browserApi<T>(
  path: string,
  options: RequestInit = {},
): Promise<T> {
  const response = await fetch(
    `${(process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3001/api/v1').replace(/\/$/, '')}${path}`,
    {
      ...options,
      credentials: 'include',
      headers: {
        Accept: 'application/json',
        ...(options.body ? { 'Content-Type': 'application/json' } : {}),
        ...options.headers,
      },
    },
  );
  if (!response.ok) {
    throw await responseError(response);
  }
  if (response.status === 204) {
    return undefined as T;
  }
  return (await response.json()) as T;
}

export function formatMoney(amount: number, currency = 'USD') {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency,
  }).format(amount / 100);
}

export function productImageUrl(url: string) {
  if (/^https?:\/\//i.test(url)) return url;
  const apiUrl =
    process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3001/api/v1';
  return new URL(url, apiUrl).toString();
}
