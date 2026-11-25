import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { ExpressAdapter } from '@nestjs/platform-express';
import request from 'supertest';
import { CatalogController } from '../dist/catalog/catalog.controller';
import { CatalogService } from '../dist/catalog/catalog.service';

describe('CatalogController', () => {
  let app: INestApplication;
  const catalog = {
    listCategories: jest.fn(),
    listProducts: jest.fn(),
    getProduct: jest.fn(),
    listProductReviews: jest.fn(),
  };

  beforeAll(async () => {
    const module = await Test.createTestingModule({
      controllers: [CatalogController],
      providers: [{ provide: CatalogService, useValue: catalog }],
    }).compile();
    app = module.createNestApplication(new ExpressAdapter());
    app.setGlobalPrefix('api/v1');
    app.useGlobalPipes(
      new ValidationPipe({
        whitelist: true,
        forbidNonWhitelisted: true,
        transform: true,
      }),
    );
    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('transforms and validates product filters before invoking the service', async () => {
    catalog.listProducts.mockResolvedValue({
      data: [],
      pagination: { page: 2, limit: 10, total: 0, totalPages: 0 },
    });

    await request(app.getHttpServer())
      .get('/api/v1/products?page=2&limit=10&minPrice=1200&inStock=false&sort=price_asc')
      .expect(200);

    expect(catalog.listProducts).toHaveBeenCalledWith(
      expect.objectContaining({
        page: 2,
        limit: 10,
        minPrice: 1200,
        inStock: false,
        sort: 'price_asc',
      }),
    );
  });

  it('supports validated category sorting and pagination', async () => {
    catalog.listCategories.mockResolvedValue({
      data: [],
      pagination: { page: 1, limit: 5, total: 0, totalPages: 0 },
    });

    await request(app.getHttpServer())
      .get('/api/v1/categories?limit=5&sort=name_desc')
      .expect(200);

    expect(catalog.listCategories).toHaveBeenCalledWith(
      expect.objectContaining({ limit: 5, sort: 'name_desc' }),
    );
  });

  it('serves backend-hosted demo artwork for product categories', async () => {
    const response = await request(app.getHttpServer())
      .get('/api/v1/demo-images/apparel.svg')
      .expect(200)
      .expect('Content-Type', /image\/svg\+xml/);

    const image = response.body.toString();
    expect(image).toContain('Apparel product image');
    expect(image).toContain('<path');
  });

  it('returns 404 for unsupported demo image categories', async () => {
    await request(app.getHttpServer())
      .get('/api/v1/demo-images/not-a-category.svg')
      .expect(404);
    await request(app.getHttpServer())
      .get('/api/v1/demo-images/toString.svg')
      .expect(404);
  });

  it('rejects invalid pagination, filters, and product slugs', async () => {
    await request(app.getHttpServer())
      .get('/api/v1/products?page=0')
      .expect(400);
    await request(app.getHttpServer())
      .get('/api/v1/products?inStock=no')
      .expect(400);
    await request(app.getHttpServer())
      .get('/api/v1/categories?sort=random')
      .expect(400);
    await request(app.getHttpServer())
      .get('/api/v1/products/not_a_valid_slug')
      .expect(400);

    expect(catalog.listProducts).not.toHaveBeenCalled();
    expect(catalog.getProduct).not.toHaveBeenCalled();
  });
});
