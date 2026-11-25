import { Controller, Get, ServiceUnavailableException } from '@nestjs/common';
import { ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import { InjectPinoLogger, PinoLogger } from 'nestjs-pino';
import { PrismaService } from './prisma.service';
import { RedisService } from './redis.service';

@ApiTags('health')
@Controller('health')
export class HealthController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly redis: RedisService,
    @InjectPinoLogger(HealthController.name)
    private readonly logger: PinoLogger,
  ) {}

  @Get()
  @ApiOperation({ summary: 'Check API and backing-service readiness' })
  @ApiOkResponse({
    schema: {
      example: {
        status: 'ok',
        services: { database: 'ok', redis: 'ok' },
      },
    },
  })
  async check() {
    try {
      await Promise.all([this.prisma.$queryRaw`SELECT 1`, this.redis.ping()]);
    } catch (error: unknown) {
      this.logger.error({ error }, 'Backing service health check failed');
      throw new ServiceUnavailableException({
        status: 'error',
        message: 'A required backing service is unavailable',
      });
    }

    return {
      status: 'ok',
      services: { database: 'ok', redis: 'ok' },
    };
  }
}
