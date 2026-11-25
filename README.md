# Commerce

A multi-client ecommerce monorepo. The Flutter customer app at the repository root is being built first as an offline-first storefront preview; the Next.js storefront and NestJS API live in `apps/storefront` and `apps/api`.

## Run locally

Requirements: Docker Engine with Docker Compose v2.

```sh
cp .env.example .env
docker compose up --build
```

The API applies checked-in Prisma migrations and runs the idempotent development seed before it starts. Open:

- Storefront: <http://localhost:3000>
- API health: <http://localhost:3001/api/v1/health>
- OpenAPI docs: <http://localhost:3001/api/docs>
- Development email inbox: <http://localhost:8025>

Set `SEED_ADMIN_PASSWORD` and `SEED_CUSTOMER_PASSWORD` in `.env` before first startup. The values in `.env.example` are development-only credentials; replace them outside local development. SMTP is captured by Mailpit for local testing; set `SMTP_HOST`, `SMTP_PORT`, and `SMTP_FROM` to a trusted mail provider outside local development. PostgreSQL and Redis data are retained in Docker volumes. To stop the services without deleting data, use `docker compose down`.

The API requires `ACCESS_TOKEN_SECRET` to contain at least 32 bytes. When upgrading an existing `.env` from Phase 1, copy the new auth and mail settings from `.env.example` before starting Compose; keep your existing database credentials. Configure `SMTP_USER` and `SMTP_PASSWORD` together when your mail provider requires authentication.

| Variable | Purpose |
| --- | --- |
| `POSTGRES_USER`, `POSTGRES_PASSWORD`, `POSTGRES_DB` | PostgreSQL container credentials and database. |
| `DATABASE_URL` | Prisma connection string; Compose defaults to the `postgres` service. |
| `REDIS_URL` | Redis connection string; Compose defaults to the `redis` service. |
| `API_PORT`, `WEB_PORT` | Host ports published for the API and storefront. |
| `CORS_ORIGIN` | Comma-separated allowed browser origins for credentialed API requests. |
| `NEXT_PUBLIC_API_URL` | API URL used by storefront browser requests. |
| `WEB_BASE_URL` | Storefront base URL used to build verification and reset links. |
| `ACCESS_TOKEN_SECRET` | Private signing key for access tokens; use a unique value of 32+ bytes. |
| `SMTP_HOST`, `SMTP_PORT`, `SMTP_SECURE` | Outgoing mail server settings; defaults target local Mailpit. |
| `SMTP_FROM` | Sender address displayed on account emails. |
| `SMTP_USER`, `SMTP_PASSWORD` | Optional SMTP credentials; set both or leave both blank. |
| `SEED_ADMIN_EMAIL`, `SEED_ADMIN_PASSWORD` | Credentials for the seeded administrator. |
| `SEED_CUSTOMER_EMAIL`, `SEED_CUSTOMER_PASSWORD` | Credentials for the seeded customer. |
| `LOG_LEVEL` | Pino log level, defaulting to `info`. |

For local development without containers, use Node.js 22.12+, PostgreSQL, and Redis:

```sh
npm install
npm run db:generate
npm run db:migrate
npm run db:seed
npm run dev:api
npm run dev:web
```

Configure `DATABASE_URL`, `REDIS_URL`, `ACCESS_TOKEN_SECRET`, `WEB_BASE_URL`, `SMTP_HOST`, `SMTP_PORT`, `SMTP_FROM`, `SEED_ADMIN_EMAIL`, `SEED_ADMIN_PASSWORD`, `SEED_CUSTOMER_EMAIL`, and `SEED_CUSTOMER_PASSWORD` in the environment first.

## Flutter customer app

The Flutter app is the first frontend being developed. From the repository root, install Flutter 3.41+ and run:

```sh
flutter pub get
flutter run
flutter test
```

The app currently uses an in-memory sample catalog and cart. It includes a responsive home/discovery catalog, category/search/filter/sort interactions, product details with options, saved items, cart quantities and the `WELCOME10` demo coupon, account entry, and a validated demo shipping flow. Sign-in, orders, and payment are intentionally not sent anywhere yet; API integration follows after this frontend checkpoint is accepted. The Next.js storefront workspace remains available and is not replaced by the Flutter app.

## Monorepo layout

```text
apps/
  api/
    prisma/
      migrations/
      schema.prisma
    src/
      app.module.ts
      auth/
      catalog/
      users/
      health.controller.ts
      main.ts
      prisma.service.ts
      redis.service.ts
      seed.ts
  storefront/
    app/
    public/
lib/
  main.dart
test/
  widget_test.dart
docker-compose.yml
package.json
```

The API is a NestJS application with a global `/api/v1` prefix, request validation, Swagger, Helmet, structured Pino request logging, PostgreSQL access through Prisma, and a Redis connection. The Next.js storefront is a separate npm workspace. Docker Compose provides PostgreSQL and Redis with persistent volumes and health checks; the API waits for both dependencies before applying migrations and starting.

## Phase 1 database

The Prisma schema and initial SQL migration define users and refresh tokens, addresses, categories, products, variants, images and inventory, carts and items, orders and price-snapshotted items, payments and webhook events, coupons, reviews, wishlists, idempotency records, and admin audit events. Currency values are integer minor units. Percentage coupon values use basis points (10,000 = 100%); product rating averages are hundredths (450 = 4.50/5). Foreign keys, unique indexes, lookup indexes, and database check constraints protect core invariants.

The seed is safe to rerun: it creates eight categories, 50 curated products with variants, inventory and image URLs, a development admin and customer, and a sample delivered order. User passwords are read from environment variables and hashed with bcrypt.

## API usage

`GET /api/v1/health` reports API, PostgreSQL, and Redis readiness. Swagger is served at `/api/docs`.

### Authentication and account endpoints

All request bodies are validated; unknown fields are rejected. Registration creates an unverified customer account and sends a verification link:

```http
POST /api/v1/auth/register
Content-Type: application/json

{"email":"alex@example.com","password":"StrongPassword123!","firstName":"Alex","lastName":"Morgan"}
```

Use the emailed token with `POST /api/v1/auth/verify-email` (`{"token":"..."}`). Sign in with `POST /api/v1/auth/login` (`{"email":"...","password":"..."}`). The response contains a short-lived bearer access token and a CSRF token; the opaque refresh token is only set in an HttpOnly cookie. Send the access token as `Authorization: Bearer <accessToken>` to `GET /api/v1/auth/me` and the `/api/v1/users/me` profile/address routes.

Refresh a session with `POST /api/v1/auth/refresh` and log out with `POST /api/v1/auth/logout`. Both require browser credentials/cookies; send the CSRF token returned at login in the `x-csrf-token` header. The refresh token is rotated on refresh. Password recovery uses `POST /api/v1/auth/forgot-password` with an email, then `POST /api/v1/auth/reset-password` with the emailed token and a new password. `POST /api/v1/auth/resend-verification` accepts an email and returns a generic response whether or not an account needs verification.

Authenticated profile routes are `GET/PATCH /api/v1/users/me`; address book routes are `GET/POST /api/v1/users/me/addresses`, `PATCH /api/v1/users/me/addresses/:addressId`, and `DELETE /api/v1/users/me/addresses/:addressId`. Address access is scoped to the authenticated user.

### Catalog endpoints

- `GET /api/v1/categories?page=1&limit=20&parentId=<categoryId>&sort=order` returns non-deleted categories with active product counts and parent summaries. Category sorting accepts `order`, `name_asc`, `name_desc`, or `newest`.
- `GET /api/v1/products` returns active products with image, variant, stock-status, price-range, and rating summaries. Supported filters are `q`, category slug, `minPrice`/`maxPrice` in minor currency units, `minRating` on a 0–5 scale, and `inStock=true|false`.
- Product sorting accepts `newest`, `price_asc`, `price_desc`, `rating_desc`, and `name_asc`. Category and product results include `pagination` metadata (`page`, `limit`, `total`, `totalPages`); page size is capped at 100.
- `GET /api/v1/products/:slug` returns the active product detail, including description, images, active variants and stock availability.
- `GET /api/v1/products/:slug/reviews?page=1&limit=10&sort=newest` returns paginated approved reviews. Review sorting accepts `newest`, `oldest`, or `rating_desc`.

All catalog list responses use `{ "data": [...], "pagination": { "page": 1, "limit": 20, "total": 0, "totalPages": 0 } }`. Prices are integer minor units, rating summaries are returned on a 0–5 scale, and only available-stock booleans are exposed publicly.

Run API unit and HTTP tests with `npm test --workspace @commerce/api`; build both workspaces with `npm run build`.

### Cart and coupons

- `GET /api/v1/cart` reads or creates the current cart. Guest carts are identified by an opaque, 30-day HttpOnly cookie; only its SHA-256 hash is stored.
- `POST /api/v1/cart/items` accepts `{"variantId":"...","quantity":1}`; `PATCH /api/v1/cart/items/:itemId` changes a quantity and `DELETE /api/v1/cart/items/:itemId` removes a line. Quantities are limited to 1–99, variant availability is checked transactionally, and item changes are scoped to the current cart.
- `POST /api/v1/cart/coupon` accepts `{"code":"SAVE10"}` and `DELETE /api/v1/cart/coupon` removes it. Cart responses include integer `subtotalAmount`, `discountAmount`, and `totalAmount`; percentage coupons use the schema’s basis-point value and optional maximum discount.
- After successful login, guest lines merge into the account cart (matching variants are combined up to 99) and the guest cookie is cleared. The user cart’s coupon takes precedence if both carts have one.

Cart availability checks account for `quantity - reserved`; carts do not hold stock. Inventory is reserved during checkout in Phase 5, where availability will be rechecked transactionally before creating an order.

## Roadmap

1. Monorepo, containers, database schema, migration, and seed
2. Authentication and user management (implemented: email verification, password recovery, rotating refresh sessions, login lockout, profile, and addresses)
3. Catalog and search (implemented: categories, product detail, variant availability, paginated filters/sorting, and approved reviews)
4. Cart, coupons, and inventory (implemented: guest/account carts, login merge, quantity checks, coupon quotes, and cart totals)
5. Flutter customer storefront first (offline-first UI; API integration follows after confirmation)
6. Checkout, payments, webhooks, orders, and email
7. Next.js storefront integration
8. Admin panel, testing, CI, docs, and production hardening
