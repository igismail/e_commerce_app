import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import cookieParser from 'cookie-parser';
import { ExpressAdapter } from '@nestjs/platform-express';
import request from 'supertest';
import { AuthController } from '../dist/auth/auth.controller';
import { AuthService } from '../dist/auth/auth.service';
import { RedisService } from '../dist/redis.service';

describe('AuthController', () => {
  let app: INestApplication;
  const auth = {
    login: jest.fn(),
    refresh: jest.fn(),
    logout: jest.fn(),
    register: jest.fn(),
    verifyEmail: jest.fn(),
    resendVerification: jest.fn(),
    forgotPassword: jest.fn(),
    resetPassword: jest.fn(),
  };
  const redis = { enforceRateLimit: jest.fn().mockResolvedValue(undefined) };

  beforeAll(async () => {
    const module = await Test.createTestingModule({
      controllers: [AuthController],
      providers: [
        { provide: AuthService, useValue: auth },
        { provide: RedisService, useValue: redis },
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

  it('sets an HTTP-only refresh cookie without exposing the refresh token in JSON', async () => {
    auth.login.mockResolvedValue({
      accessToken: 'access-token',
      refreshToken: 'refresh-token-value',
      csrfToken: 'csrf-token-value',
    });

    const response = await request(app.getHttpServer())
      .post('/api/v1/auth/login')
      .send({ email: 'alex@example.com', password: 'CorrectPassword123!' })
      .expect(200);
    const cookies = response.headers['set-cookie'].join('; ');

    expect(response.body).toMatchObject({
      accessToken: 'access-token',
      csrfToken: 'csrf-token-value',
      tokenType: 'Bearer',
      expiresIn: 900,
    });
    expect(response.body).not.toHaveProperty('refreshToken');
    expect(cookies).toContain('refresh_token=refresh-token-value');
    expect(cookies).toContain('HttpOnly');
    expect(cookies).toContain('SameSite=Strict');
    expect(cookies).toContain('csrf_token=csrf-token-value');
    expect(redis.enforceRateLimit).toHaveBeenCalledTimes(2);
  });

  it('requires a matching double-submit CSRF token before rotating a session', async () => {
    auth.refresh.mockResolvedValue({
      accessToken: 'new-access',
      refreshToken: 'new-refresh',
      csrfToken: 'new-csrf',
    });

    await request(app.getHttpServer())
      .post('/api/v1/auth/refresh')
      .set('Cookie', 'refresh_token=old-refresh; csrf_token=stored-csrf')
      .set('x-csrf-token', 'different-csrf')
      .expect(401);
    expect(auth.refresh).not.toHaveBeenCalled();

    const response = await request(app.getHttpServer())
      .post('/api/v1/auth/refresh')
      .set('Cookie', 'refresh_token=old-refresh; csrf_token=stored-csrf')
      .set('x-csrf-token', 'stored-csrf')
      .expect(200);

    expect(auth.refresh).toHaveBeenCalledWith('old-refresh');
    expect(response.body.accessToken).toBe('new-access');
  });

  it('rejects unknown registration fields instead of allowing role escalation', async () => {
    await request(app.getHttpServer())
      .post('/api/v1/auth/register')
      .send({
        email: 'alex@example.com',
        password: 'StrongPassword123!',
        firstName: 'Alex',
        lastName: 'Morgan',
        role: 'ADMIN',
      })
      .expect(400);

    expect(auth.register).not.toHaveBeenCalled();
  });

  it('merges the guest cart after login and clears its cookie', async () => {
    const token = 'A'.repeat(43);
    auth.login.mockResolvedValue({
      accessToken: 'access-token',
      refreshToken: 'refresh-token',
      csrfToken: 'csrf-token',
    });

    const response = await request(app.getHttpServer())
      .post('/api/v1/auth/login')
      .set('Cookie', `guest_cart_token=${token}`)
      .send({ email: 'alex@example.com', password: 'CorrectPassword123!' })
      .expect(200);
    const cookies = response.headers['set-cookie'].join('; ');

    expect(auth.login).toHaveBeenCalledWith(
      expect.objectContaining({ email: 'alex@example.com' }),
      token,
    );
    expect(cookies).toContain('guest_cart_token=;');
    expect(cookies).toContain('Path=/api/v1');
  });
});
