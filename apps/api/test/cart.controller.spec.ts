import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import cookieParser from 'cookie-parser';
import { ExpressAdapter } from '@nestjs/platform-express';
import request from 'supertest';
import { RedisService } from '../dist/redis.service';
import { CartController } from '../dist/cart/cart.controller';
import { CartService } from '../dist/cart/cart.service';
import { OptionalJwtAuthGuard } from '../dist/cart/optional-jwt-auth.guard';

describe('CartController', () => {
  let app: INestApplication;
  const cart = {
    getCart: jest.fn(),
    addItem: jest.fn(),
    updateItem: jest.fn(),
    removeItem: jest.fn(),
    applyCoupon: jest.fn(),
    removeCoupon: jest.fn(),
  };
  const redis = { enforceRateLimit: jest.fn().mockResolvedValue(undefined) };

  beforeAll(async () => {
    const module = await Test.createTestingModule({
      controllers: [CartController],
      providers: [
        { provide: CartService, useValue: cart },
        { provide: RedisService, useValue: redis },
        OptionalJwtAuthGuard,
      ],
    }).compile();
    app = module.createNestApplication(new ExpressAdapter());
    app.setGlobalPrefix('api/v1');
    app.use(cookieParser());
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
    redis.enforceRateLimit.mockResolvedValue(undefined);
  });

  it('creates a guest cart with an HttpOnly token cookie', async () => {
    const guestToken = 'A'.repeat(43);
    cart.getCart.mockResolvedValue({
      data: { id: 'cart-1', items: [], subtotalAmount: 0 },
      guestToken,
    });

    const response = await request(app.getHttpServer())
      .get('/api/v1/cart')
      .expect(200);

    expect(cart.getCart).toHaveBeenCalledWith(undefined, undefined);
    expect(response.body.id).toBe('cart-1');
    expect(response.headers['set-cookie'].join('; ')).toContain(
      `guest_cart_token=${guestToken}`,
    );
    expect(response.headers['set-cookie'].join('; ')).toContain('HttpOnly');
    expect(response.headers['set-cookie'].join('; ')).toContain(
      'Path=/api/v1',
    );
  });

  it('normalizes coupon codes and rate-limits coupon attempts', async () => {
    cart.applyCoupon.mockResolvedValue({
      data: { id: 'cart-1', items: [] },
      guestToken: 'B'.repeat(43),
    });

    await request(app.getHttpServer())
      .post('/api/v1/cart/coupon')
      .send({ code: ' save-20 ' })
      .expect(200);

    expect(redis.enforceRateLimit).toHaveBeenCalledWith(
      expect.stringMatching(/^cart:coupon:ip:/),
      10,
      3600,
    );
    expect(cart.applyCoupon).toHaveBeenCalledWith(
      undefined,
      undefined,
      { code: 'SAVE-20' },
    );
  });

  it('rejects invalid quantities and unknown fields before changing the cart', async () => {
    await request(app.getHttpServer())
      .post('/api/v1/cart/items')
      .send({ variantId: 'variant-1', quantity: 100 })
      .expect(400);
    await request(app.getHttpServer())
      .post('/api/v1/cart/items')
      .send({ variantId: 'variant-1', quantity: 1, priceAmount: 1 })
      .expect(400);

    expect(cart.addItem).not.toHaveBeenCalled();
  });
});
