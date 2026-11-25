import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma, ProductStatus, ReviewStatus } from '../generated/prisma/client';
import { PrismaService } from '../prisma.service';
import {
  CategoryQueryDto,
  CategorySort,
  ProductQueryDto,
  ProductReviewsQueryDto,
  ProductSort,
  ReviewSort,
} from './catalog.dto';

const productInclude = {
  category: { select: { id: true, name: true, slug: true } },
  images: { orderBy: { sortOrder: 'asc' } },
  variants: {
    where: { isActive: true, deletedAt: null },
    orderBy: [{ priceAmount: 'asc' }, { sku: 'asc' }],
    select: {
      id: true,
      sku: true,
      name: true,
      optionValues: true,
      priceAmount: true,
      compareAtAmount: true,
      inventory: { select: { quantity: true, reserved: true } },
    },
  },
} satisfies Prisma.ProductInclude;

type CatalogProduct = Prisma.ProductGetPayload<{
  include: typeof productInclude;
}>;

@Injectable()
export class CatalogService {
  constructor(private readonly prisma: PrismaService) {}

  async listCategories(query: CategoryQueryDto) {
    const page = query.page ?? 1;
    const limit = query.limit ?? 20;
    const where: Prisma.CategoryWhereInput = {
      deletedAt: null,
      ...(query.parentId ? { parentId: query.parentId } : {}),
    };
    const [categories, total] = await Promise.all([
      this.prisma.category.findMany({
        where,
        orderBy: this.categoryOrderBy(query.sort ?? CategorySort.ORDER),
        skip: (page - 1) * limit,
        take: limit,
        include: {
          parent: { select: { id: true, name: true, slug: true } },
          _count: {
            select: {
              products: {
                where: {
                  status: ProductStatus.ACTIVE,
                  deletedAt: null,
                  variants: { some: { isActive: true, deletedAt: null } },
                },
              },
            },
          },
        },
      }),
      this.prisma.category.count({ where }),
    ]);

    return {
      data: categories.map(({ _count, ...category }) => ({
        ...category,
        productCount: _count.products,
      })),
      pagination: this.pagination(page, limit, total),
    };
  }

  async listProducts(query: ProductQueryDto) {
    if (
      query.minPrice !== undefined &&
      query.maxPrice !== undefined &&
      query.minPrice > query.maxPrice
    ) {
      throw new BadRequestException('minPrice must not exceed maxPrice');
    }

    const page = query.page ?? 1;
    const limit = query.limit ?? 20;
    const conditions: Prisma.Sql[] = [
      Prisma.sql`p."status" = 'ACTIVE'::"ProductStatus"`,
      Prisma.sql`p."deletedAt" IS NULL`,
      Prisma.sql`c."deletedAt" IS NULL`,
      Prisma.sql`v."isActive" = TRUE`,
      Prisma.sql`v."deletedAt" IS NULL`,
    ];
    if (query.category) {
      conditions.push(Prisma.sql`c."slug" = ${query.category}`);
    }
    if (query.q) {
      const search = `%${query.q.trim()}%`;
      conditions.push(
        Prisma.sql`(p."name" ILIKE ${search} OR p."description" ILIKE ${search} OR p."brand" ILIKE ${search})`,
      );
    }
    if (query.minPrice !== undefined) {
      conditions.push(Prisma.sql`v."priceAmount" >= ${query.minPrice}`);
    }
    if (query.maxPrice !== undefined) {
      conditions.push(Prisma.sql`v."priceAmount" <= ${query.maxPrice}`);
    }
    if (query.minRating !== undefined) {
      conditions.push(
        Prisma.sql`p."ratingAverage" >= ${Math.round(query.minRating * 100)}`,
      );
    }
    if (query.inStock === true) {
      conditions.push(Prisma.sql`COALESCE(i."quantity" - i."reserved", 0) > 0`);
    } else if (query.inStock === false) {
      conditions.push(Prisma.sql`COALESCE(i."quantity" - i."reserved", 0) <= 0`);
    }

    const sort = query.sort ?? ProductSort.NEWEST;
    const orderBy = this.productOrderBy(sort);
    const [result] = await this.prisma.$queryRaw<
      Array<{ ids: string[]; total: number }>
    >(Prisma.sql`
      WITH matching AS (
        SELECT
          p."id",
          p."name",
          p."createdAt",
          p."ratingAverage",
          MIN(v."priceAmount") AS "priceAmount"
        FROM "Product" p
        JOIN "Category" c ON c."id" = p."categoryId"
        JOIN "ProductVariant" v ON v."productId" = p."id"
        LEFT JOIN "Inventory" i ON i."variantId" = v."id"
        WHERE ${Prisma.join(conditions, ' AND ')}
        GROUP BY p."id", p."name", p."createdAt", p."ratingAverage"
      ),
      page AS (
        SELECT m."id"
        FROM matching m
        ORDER BY ${orderBy}
        LIMIT ${limit} OFFSET ${(page - 1) * limit}
      )
      SELECT
        COALESCE(json_agg(page."id"), '[]'::json) AS "ids",
        (SELECT COUNT(*)::int FROM matching) AS "total"
      FROM page
    `);
    const ids = result?.ids ?? [];
    const products = ids.length
      ? await this.prisma.product.findMany({
          where: {
            id: { in: ids },
            status: ProductStatus.ACTIVE,
            deletedAt: null,
            category: { deletedAt: null },
          },
          include: productInclude,
        })
      : [];
    const productsById = new Map(products.map((product) => [product.id, product]));

    return {
      data: ids.flatMap((id) => {
        const product = productsById.get(id);
        return product ? [this.presentProduct(product, false)] : [];
      }),
      pagination: this.pagination(page, limit, result?.total ?? 0),
    };
  }

  async getProduct(slug: string) {
    const product = await this.prisma.product.findFirst({
      where: {
        slug,
        status: ProductStatus.ACTIVE,
        deletedAt: null,
        category: { deletedAt: null },
        variants: { some: { isActive: true, deletedAt: null } },
      },
      include: productInclude,
    });
    if (!product) {
      throw new NotFoundException('Product not found');
    }
    return this.presentProduct(product, true);
  }

  async listProductReviews(slug: string, query: ProductReviewsQueryDto) {
    const product = await this.prisma.product.findFirst({
      where: {
        slug,
        status: ProductStatus.ACTIVE,
        deletedAt: null,
        category: { deletedAt: null },
        variants: { some: { isActive: true, deletedAt: null } },
      },
      select: { id: true },
    });
    if (!product) {
      throw new NotFoundException('Product not found');
    }

    const page = query.page ?? 1;
    const limit = query.limit ?? 10;
    const sort = query.sort ?? ReviewSort.NEWEST;
    const orderBy =
      sort === ReviewSort.OLDEST
        ? [{ createdAt: 'asc' as const }, { id: 'asc' as const }]
        : sort === ReviewSort.RATING_DESC
          ? [
              { rating: 'desc' as const },
              { createdAt: 'desc' as const },
              { id: 'desc' as const },
            ]
          : [{ createdAt: 'desc' as const }, { id: 'desc' as const }];
    const where = { productId: product.id, status: ReviewStatus.APPROVED };
    const [reviews, total] = await Promise.all([
      this.prisma.review.findMany({
        where,
        orderBy,
        skip: (page - 1) * limit,
        take: limit,
        select: {
          id: true,
          rating: true,
          title: true,
          body: true,
          createdAt: true,
          user: { select: { firstName: true } },
        },
      }),
      this.prisma.review.count({ where }),
    ]);

    return { data: reviews, pagination: this.pagination(page, limit, total) };
  }

  private productOrderBy(sort: ProductSort) {
    switch (sort) {
      case ProductSort.PRICE_ASC:
        return Prisma.sql`m."priceAmount" ASC, m."id" ASC`;
      case ProductSort.PRICE_DESC:
        return Prisma.sql`m."priceAmount" DESC, m."id" ASC`;
      case ProductSort.RATING_DESC:
        return Prisma.sql`m."ratingAverage" DESC, m."id" ASC`;
      case ProductSort.NAME_ASC:
        return Prisma.sql`m."name" ASC, m."id" ASC`;
      default:
        return Prisma.sql`m."createdAt" DESC, m."id" ASC`;
    }
  }

  private categoryOrderBy(
    sort: CategorySort,
  ): Prisma.CategoryOrderByWithRelationInput[] {
    switch (sort) {
      case CategorySort.NAME_ASC:
        return [{ name: 'asc' }, { id: 'asc' }];
      case CategorySort.NAME_DESC:
        return [{ name: 'desc' }, { id: 'asc' }];
      case CategorySort.NEWEST:
        return [{ createdAt: 'desc' }, { id: 'asc' }];
      default:
        return [{ sortOrder: 'asc' }, { name: 'asc' }, { id: 'asc' }];
    }
  }

  private presentProduct(product: CatalogProduct, includeDescription: boolean) {
    const variants = product.variants.map((variant) => ({
      id: variant.id,
      sku: variant.sku,
      name: variant.name,
      optionValues: variant.optionValues,
      priceAmount: variant.priceAmount,
      compareAtAmount: variant.compareAtAmount,
      inStock: (variant.inventory?.quantity ?? 0) - (variant.inventory?.reserved ?? 0) > 0,
    }));
    const prices = variants.map((variant) => variant.priceAmount);

    return {
      id: product.id,
      name: product.name,
      slug: product.slug,
      ...(includeDescription ? { description: product.description } : {}),
      brand: product.brand,
      ratingAverage: product.ratingAverage / 100,
      ratingCount: product.ratingCount,
      category: product.category,
      images: product.images,
      variants,
      priceRange: prices.length
        ? { min: Math.min(...prices), max: Math.max(...prices) }
        : null,
      inStock: variants.some((variant) => variant.inStock),
    };
  }

  private pagination(page: number, limit: number, total: number) {
    return {
      page,
      limit,
      total,
      totalPages: Math.ceil(total / limit),
    };
  }
}
