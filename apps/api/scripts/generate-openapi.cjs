require('reflect-metadata');

process.env.ACCESS_TOKEN_SECRET ??=
  'openapi-generation-only-key-not-for-authentication';

const fs = require('node:fs');
const path = require('node:path');
const { DocumentBuilder, SwaggerModule } = require('@nestjs/swagger');
const { Test } = require('@nestjs/testing');
const expressAdapterPath = require.resolve('@nestjs/platform-express', {
  paths: [path.join(__dirname, '..')],
});
const { ExpressAdapter } = require(expressAdapterPath);
const { AppModule } = require('../dist/app.module');
const { PrismaService } = require('../dist/prisma.service');
const { RedisService } = require('../dist/redis.service');

async function generate() {
  const moduleRef = await Test.createTestingModule({
    imports: [AppModule],
  })
    .overrideProvider(PrismaService)
    .useValue({})
    .overrideProvider(RedisService)
    .useValue({})
    .compile();
  const app = moduleRef.createNestApplication(new ExpressAdapter());
  app.setGlobalPrefix('api/v1');

  const config = new DocumentBuilder()
    .setTitle('Commerce API')
    .setDescription('Versioned REST API for the Commerce platform')
    .setVersion('1.0.0')
    .addBearerAuth()
    .addCookieAuth('refresh_token', { type: 'apiKey', in: 'cookie' })
    .addCookieAuth('guest_cart_token', { type: 'apiKey', in: 'cookie' })
    .build();
  const document = SwaggerModule.createDocument(app, config);
  const outputPath = path.join(__dirname, '../openapi.json');
  fs.writeFileSync(outputPath, `${JSON.stringify(document, null, 2)}\n`);
  await app.close();
}

generate().catch((error) => {
  console.error('OpenAPI generation failed:', error);
  process.exitCode = 1;
});
