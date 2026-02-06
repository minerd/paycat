# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

MRRCat is a self-hosted subscription and in-app purchase management platform (RevenueCat alternative). It runs on Cloudflare Workers with D1 database and provides SDKs for all major platforms.

## Build and Development Commands

### Backend (Cloudflare Workers)
```bash
npm run dev              # Start local dev server (wrangler) on :8787
npm run deploy           # Deploy to Cloudflare
npm run typecheck        # TypeScript compilation check
npm run db:migrate       # Run D1 migrations locally
npm run db:migrate:prod  # Run D1 migrations in production
```

### Admin Panel (`admin-panel/`)
```bash
npm run dev          # Vite dev server on :3000, proxies /admin to :8787
npm run build        # Production build
npm run deploy       # Deploy to Cloudflare Pages
```

### CLI Tool (`cli/`)
```bash
npm run build        # TypeScript compilation
npm run dev          # Run with ts-node
npm start            # Run built CLI
```

### Web SDK (`sdks/web/`)
```bash
npm run build        # Build with tsup (CJS + ESM)
npm run test         # Run Vitest tests
```

### React Native SDK (`sdks/react-native/`)
```bash
npm run typescript   # Type checking
npm run lint         # ESLint
npm run prepare      # Build with react-native-builder-bob
```

### Flutter SDK (`sdks/flutter/`)
```bash
flutter pub get
flutter test
```

## Architecture

### Backend (`src/`)
- **Framework**: Hono on Cloudflare Workers
- **Database**: Cloudflare D1 (SQLite), schema in `src/db/schema.sql`
- **Cache**: Cloudflare KV
- **Entry point**: `src/index.ts`
- **Types**: `src/types/index.ts` — `Env` bindings, all DB models, API response types, Hono context augmentation

### Request Flow

All requests go through global middleware in order: CORS → prettyJSON → secureHeaders → logging → error handling → rate limiting.

**API v1 routes** (`/v1/*`) additionally pass through `authMiddleware` which validates `X-API-Key` header (`pk_live_*` or `pk_test_*` format), looks up the app in D1, and sets it on Hono context via `c.set('app', app)`. Access the current app in route handlers with `c.get('app')`.

**Admin routes** (`/admin/*`) use `adminAuthMiddleware` which accepts either `X-Admin-Key` header or `Authorization: Bearer <session-token>`. Sessions are stored in `admin_sessions` table with 24h expiry.

**Notification routes** (`/v1/notifications/*`) are mounted outside the v1 auth middleware — they use platform-specific signature verification instead of API keys.

### Key Directories
- `src/routes/` — API endpoint handlers. Each file exports a Hono router.
- `src/services/` — Business logic. Platform integrations in subdirectories: `apple/`, `google/`, `stripe/`, `amazon/`, `paddle/`
- `src/middleware/` — Auth (`auth.ts`, `admin-auth.ts`), error handling, rate limiting, logging
- `src/db/queries.ts` — All database access functions. Routes/services call these rather than writing SQL directly.
- `src/scheduled/index.ts` — Cron job handler: webhook retries, subscription/trial/grace period expiration, session cleanup

### Error Handling

Use the `Errors` factory from `src/middleware/error.ts`: `Errors.badRequest()`, `Errors.notFound()`, `Errors.platformError()`, etc. These create `MRRCatError` instances caught by the error middleware.

### Route Aliasing

Some routes are mounted at multiple paths: `/v1/products` → `offeringsRouter`, `/v1/events` → `integrationsRouter`.

### Platform Notification Handlers
`src/routes/notifications/` handles server-to-server webhooks from:
- Apple App Store (S2S Notifications V2)
- Google Play (RTDN)
- Stripe, Amazon SNS, Paddle

### Admin Panel (`admin-panel/`)
React 18 + Vite + Tailwind CSS. Path alias `@/` maps to `src/`. Dev server proxies `/admin` requests to the backend at `:8787`.

### SDKs (`sdks/`)
Native implementations for iOS (Swift), Android (Kotlin), Flutter (Dart), React Native (TypeScript), Web (TypeScript), KMP (Kotlin Multiplatform), Unity, Capacitor. All SDKs require a `baseURL` parameter for self-hosted deployments.

### CLI (`cli/`)
Node.js CLI using Commander.js for managing apps, subscribers, subscriptions, entitlements, and webhooks.

## Database

Schema is in `src/db/schema.sql`. All resources are scoped to `app_id` for multi-tenancy. Timestamps use epoch milliseconds (`Date.now()`), not ISO strings.

Core tables:
- `apps` — Multi-tenant applications with per-platform configs (JSON in `apple_config`, `google_config`, `stripe_config`)
- `subscribers` — Users identified by `app_user_id` per app
- `subscriptions` — Active subscriptions with platform-specific fields
- `transactions` — Purchase/renewal audit log
- `entitlement_definitions` / `product_entitlements` — Feature access mapping
- `webhooks` / `webhook_deliveries` — Outbound webhook config and delivery tracking with retry
- `analytics_events` — Event log for analytics
- `admin_users` / `admin_sessions` — Admin dashboard auth (PBKDF2 password hashing)

## Deployment

Configured in `wrangler.toml`:
- D1 database binding: `DB`
- KV cache binding: `CACHE`
- Cron triggers: `*/5 * * * *` (webhook retries, session cleanup), `0 * * * *` (subscription expiration)

Required secrets (set via `wrangler secret put`):
- `APPLE_PRIVATE_KEY`
- `GOOGLE_SERVICE_ACCOUNT`
- `STRIPE_SECRET_KEY`

## API Documentation

- OpenAPI spec: `docs/openapi.yaml`
- Postman collection: `docs/paycat.postman_collection.json`
