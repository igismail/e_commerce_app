# Commerce

A multi-client ecommerce monorepo. The Flutter customer app at the repository root is an offline-first storefront preview. The API-backed Next.js storefront and NestJS API live in `apps/storefront` and `apps/api`.

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

| Variable                                              | Purpose                                                                 |
| ----------------------------------------------------- | ----------------------------------------------------------------------- |
| `POSTGRES_USER`, `POSTGRES_PASSWORD`, `POSTGRES_DB`   | PostgreSQL container credentials and database.                          |
| `DATABASE_URL`                                        | Prisma connection string; Compose defaults to the `postgres` service.   |
| `REDIS_URL`                                           | Redis connection string; Compose defaults to the `redis` service.       |
| `API_PORT`, `WEB_PORT`                                | Host ports published for the API and storefront.                        |
| `CORS_ORIGIN`                                         | Comma-separated allowed browser origins for credentialed API requests.  |
| `NEXT_PUBLIC_API_URL`                                 | API URL used by storefront browser requests.                            |
| `NEXT_PUBLIC_WEB_URL`                              | Public storefront origin used for metadata and sitemap URLs.         |
| `WEB_BASE_URL`                                        | Storefront base URL used to build verification and reset links.         |
| `ACCESS_TOKEN_SECRET`                                 | Private signing key for access tokens; use a unique value of 32+ bytes. |
| `SMTP_HOST`, `SMTP_PORT`, `SMTP_SECURE`               | Outgoing mail server settings; defaults target local Mailpit.           |
| `SMTP_FROM`                                           | Sender address displayed on account emails.                             |
| `SMTP_USER`, `SMTP_PASSWORD`                          | Optional SMTP credentials; set both or leave both blank.                |
| `STRIPE_SECRET_KEY`                                   | Stripe secret API key; use a test-mode key for local checkout.          |
| `STRIPE_WEBHOOK_SECRET`                               | Signing secret from Stripe CLI or the configured webhook endpoint.      |
| `NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY`               | Stripe publishable key used by the browser Payment Element.           |
| `CURRENCY`                                            | Checkout currency; currently only `USD` is supported.                   |
| `TAX_RATE_BPS`                                        | Flat tax rate in basis points (10,000 = 100%); defaults to 0.           |
| `SHIPPING_STANDARD_AMOUNT`, `SHIPPING_EXPRESS_AMOUNT` | Shipping fees in USD cents; defaults to 599 and 1299.                   |
| `PAYMENT_RESERVATION_MINUTES`                         | How long checkout reserves stock while payment is pending (1–1440).     |
| `ABANDONED_CART_HOURS`                                | Cart inactivity period before a reminder job is eligible (1–720).       |
| `LOW_STOCK_THRESHOLD`                                 | Inventory quantity at or below which a low-stock alert is eligible.     |
| `LOW_STOCK_ALERT_EMAIL`                               | Optional recipient; low-stock alert emails are disabled when empty.     |
| `SEED_ADMIN_EMAIL`, `SEED_ADMIN_PASSWORD`             | Credentials for the seeded administrator.                               |
| `SEED_CUSTOMER_EMAIL`, `SEED_CUSTOMER_PASSWORD`       | Credentials for the seeded customer.                                    |
| `LOG_LEVEL`                                           | Pino log level, defaulting to `info`.                                   |

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

## Flutter storefront preview

From the repository root, install Flutter 3.41+ and run:

```sh
flutter pub get
flutter run
flutter test
```

This independent app uses an in-memory sample catalog and cart. It includes a responsive home/discovery catalog, category/search/filter/sort interactions, product details with options, saved items, cart quantities and the `WELCOME10` demo coupon, account entry, and a validated demo shipping flow. Sign-in, orders, and payment are not sent to the API.

## Next.js storefront

The API-backed storefront runs at <http://localhost:3000> with Docker Compose. It includes server-rendered catalog and product pages, search and filters, product image galleries and reviews, guest/account carts and coupons, sign-in and account creation, password recovery and email verification, profile and address management, order history and status, cancellation, and Stripe Payment Element checkout.

Server-rendered requests use `API_INTERNAL_URL` (Compose defaults to `http://api:3001/api/v1`); browser requests use `NEXT_PUBLIC_API_URL` and credentialed CORS. Set `CORS_ORIGIN` to the public storefront origin when deploying. `NEXT_PUBLIC_API_URL`, `NEXT_PUBLIC_WEB_URL`, and `NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY` are embedded at image build time; pass them through `.env` before running Compose. Checkout also requires `STRIPE_SECRET_KEY` and `STRIPE_WEBHOOK_SECRET`. Product routes provide metadata, while `/sitemap.xml` and `/robots.txt` are generated by the storefront.

Wishlist API/UI, administration UI, and generated OpenAPI TypeScript client are not yet integrated.

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

Cart availability checks account for `quantity - reserved`; carts do not hold stock. Inventory is reserved during checkout in a database transaction.

### Checkout, payments, and orders

Checkout and payment creation require an authenticated account and a configured Stripe secret key. Copy Stripe test keys into `.env`; checkout remains unavailable until `STRIPE_SECRET_KEY` is set. Start the API and forward Stripe test webhooks to it:

```sh
stripe listen --forward-to localhost:3001/api/v1/webhooks/stripe
```

Set the printed `whsec_...` value as `STRIPE_WEBHOOK_SECRET`, then restart the API. The webhook endpoint verifies Stripe signatures against the raw request body and deduplicates event IDs. Do not mark an order paid based on a client redirect or client-side payment result; the verified webhook is authoritative.

`POST /api/v1/checkout` requires a bearer token and an `Idempotency-Key` header (8–128 letters, digits, `.`, `_`, `:`, or `-`). Reuse the same key only when retrying the exact same request. The JSON body requires a `shippingAddress` with `fullName`, `line1`, `city`, `region`, `postalCode`, and two-letter `countryCode`; optional fields are `phone`, `line2`, `billingAddress`, `customerNote`, and `shippingMethod` (`STANDARD` or `EXPRESS`). For example:

```http
POST /api/v1/checkout
Authorization: Bearer <accessToken>
Idempotency-Key: checkout-attempt-2026-001
Content-Type: application/json

{
  "shippingAddress": {
    "fullName": "Alex Morgan",
    "line1": "123 Market Street",
    "city": "San Francisco",
    "region": "CA",
    "postalCode": "94105",
    "countryCode": "US"
  },
  "shippingMethod": "STANDARD"
}
```

The response contains the order price snapshot and a Stripe PaymentIntent `clientSecret` for confirmation in the client’s Stripe SDK. All prices are USD cents. Tax is a configured flat basis-point rate on discounted merchandise (shipping is excluded); `TAX_RATE_BPS=0` is the default, not a jurisdiction-specific tax calculation. Stock is reserved for the configured payment window and released on expiration or cancellation. A late successful payment is automatically refunded.

- `GET /api/v1/orders?page=1&limit=20&status=PAID` lists only the authenticated user’s orders.
- `GET /api/v1/orders/:orderId` returns that user’s order details.
- `POST /api/v1/orders/:orderId/cancel` cancels eligible unpaid orders or requests a refund for paid/processing orders. Shipped and delivered orders cannot be cancelled.
- BullMQ workers process payment-success notifications, reservation expiry, abandoned-cart reminders, and configured low-stock alerts. Mail delivery uses the SMTP settings above.

Paid-order cancellations restore inventory after a full refund, guarded so duplicate refund events cannot restock it twice. Payment creation, cancellation/refunds, webhook processing, stock reservation, and order transitions are implemented in the API. Stripe keys are deliberately optional for startup and required only when calling checkout.

## Roadmap

1. Monorepo, containers, database schema, migration, and seed (implemented)
2. Authentication and user management (implemented: email verification, password recovery, rotating refresh sessions, login lockout, profile, and addresses)
3. Catalog and search (implemented: categories, product detail, variant availability, paginated filters/sorting, and approved reviews)
4. Cart, coupons, and inventory (implemented: guest/account carts, login merge, quantity checks, coupon quotes, and cart totals)
5. Checkout, payments, webhooks, orders, and email (implemented and approved)
6. Flutter storefront preview (implemented and approved; remains offline-first)
7. API-backed Next.js storefront (in progress; awaiting acceptance)
8. Wishlist and admin integration, generated API client, testing, CI, and production hardening
