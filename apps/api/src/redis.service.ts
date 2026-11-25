import {
  Injectable,
  HttpException,
  HttpStatus,
  OnModuleDestroy,
  OnModuleInit,
} from '@nestjs/common';
import Redis from 'ioredis';

@Injectable()
export class RedisService implements OnModuleInit, OnModuleDestroy {
  private readonly client = new Redis(
    process.env.REDIS_URL ?? 'redis://localhost:6379',
    {
      lazyConnect: true,
      connectTimeout: 5000,
      maxRetriesPerRequest: 1,
    },
  );

  async onModuleInit() {
    await this.client.connect();
  }

  async onModuleDestroy() {
    await this.client.quit();
  }

  async ping() {
    const result = await this.client.ping();
    if (result !== 'PONG') {
      throw new Error('Redis health check returned an unexpected response');
    }
  }

  async enforceRateLimit(key: string, limit: number, windowSeconds: number) {
    const count = Number(
      await this.client.eval(
        "local count = redis.call('INCR', KEYS[1]); if count == 1 then redis.call('EXPIRE', KEYS[1], ARGV[1]); end; return count",
        1,
        key,
        windowSeconds,
      ),
    );
    if (count > limit) {
      throw new HttpException(
        'Too many requests. Try again later.',
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }
  }
}
