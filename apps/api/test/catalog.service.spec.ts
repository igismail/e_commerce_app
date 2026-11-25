import { BadRequestException, NotFoundException } from '@nestjs/common';
import { CatalogService } from '../dist/catalog/catalog.service';
import { ProductSort } from '../dist/catalog/catalog.dto';

describe('CatalogService', () => {
  function makeService() {
    const prisma = {
      category: {
        findMany: jest.fn().mockResolvedValue([]),
        count: jest.fn().mockResolvedValue(0),
      },
      product: {
        findMany: jest.fn().mockResolvedValue([]),
        findFirst: jest.fn(),
      },
      review: {
        findMany: jest.fn().mockResolvedValue([]),
        count: jest.fn().mockResolvedValue(0),
      },
      $queryRaw: jest.fn().mockResolvedValue([{ ids: [], total: 0 }]),
    };
    return {
      service: new CatalogService(prisma as never),
      prisma,
    };
  }

  it('applies catalog filters and preserves the database sort order in the response', async () => {
    const { service, prisma } = makeService();
    prisma.$queryRaw.mockResolvedValue([
      { ids: ['product-b', 'product-a'], total: 11 },
    ]);
    const product = (id: string, slug: string, priceAmount: number) => ({
      id,
      name: slug,
      slug,
      description: 'Private long description',
      brand: 'Commerce',
      ratingAverage: 450,
      ratingCount: 3,
      category: { id: 'category-1', name: 'Home', slug: 'home' },
      images: [],
      variants: [
        {
          id: `${id}-variant`,
          sku: `${id}-sku`,
          name: 'Standard',
          optionValues: { color: 'Natural' },
          priceAmount,
          compareAtAmount: null,
          inventory: { quantity: 3, reserved: 3 },
        },
      ],
    });
    prisma.product.findMany.mockResolvedValue([
      product('product-a', 'a', 2500),
      product('product-b', 'b', 3500),
    ]);

    const response = await service.listProducts({
      category: 'home',
      q: 'hoodie',
      minPrice: 2000,
      maxPrice: 5000,
      minRating: 4.5,
      inStock: false,
      sort: ProductSort.PRICE_ASC,
      page: 2,
      limit: 5,
    });

    expect(prisma.$queryRaw).toHaveBeenCalledTimes(1);
    expect(response.data.map((item) => item.slug)).toEqual(['b', 'a']);
    expect(response.data[0]).toMatchObject({
      priceRange: { min: 3500, max: 3500 },
      inStock: false,
    });
    expect(response.data[0]).not.toHaveProperty('description');
    expect(response.pagination).toEqual({
      page: 2,
      limit: 5,
      total: 11,
      totalPages: 3,
    });
    expect(prisma.product.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          id: { in: ['product-b', 'product-a'] },
          status: 'ACTIVE',
          deletedAt: null,
        }),
      }),
    );
  });

  it('rejects inverted price ranges before querying the database', async () => {
    const { service, prisma } = makeService();

    await expect(
      service.listProducts({ minPrice: 500, maxPrice: 100 }),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(prisma.$queryRaw).not.toHaveBeenCalled();
  });

  it('hides inactive, deleted, or unknown products from the public detail route', async () => {
    const { service, prisma } = makeService();
    prisma.product.findFirst.mockResolvedValue(null);

    await expect(service.getProduct('missing-product')).rejects.toBeInstanceOf(
      NotFoundException,
    );
    expect(prisma.product.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          status: 'ACTIVE',
          deletedAt: null,
          variants: { some: { isActive: true, deletedAt: null } },
        }),
      }),
    );
  });

  it('returns only approved reviews with pagination', async () => {
    const { service, prisma } = makeService();
    prisma.product.findFirst.mockResolvedValue({ id: 'product-1' });
    prisma.review.findMany.mockResolvedValue([]);
    prisma.review.count.mockResolvedValue(12);

    const response = await service.listProductReviews('sample-product', {
      page: 2,
      limit: 5,
    });

    expect(prisma.review.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { productId: 'product-1', status: 'APPROVED' },
        skip: 5,
        take: 5,
      }),
    );
    expect(response.pagination).toEqual({
      page: 2,
      limit: 5,
      total: 12,
      totalPages: 3,
    });
  });
});
