# Project knowledge

This file gives Codebuff context about your project: goals, commands, conventions, and gotchas.

## Overview
- **Name:** PaymentRecoveryApp
- **Description:** Shopify app that recovers sales lost to declined payments. Detects failed payment events via webhooks, classifies them as confirmed declines or likely late-stage abandonments, and sends targeted recovery emails to bring customers back to checkout.

## Tech Stack
- **Framework:** Remix v2 (React + TypeScript)
- **Runtime:** Node.js 20+
- **Database:** PostgreSQL (via Prisma ORM)
- **Queue / Cache:** Redis + BullMQ
- **Email:** Postmark
- **SMS:** Twilio
- **Hosting:** Render
- **Error Tracking:** Sentry
- **Styling:** Tailwind CSS
- **Testing:** Vitest

## Quickstart
- Setup: `npm install` then copy `.env.example` to `.env` and fill in values
- DB setup: `npx prisma migrate dev`
- Dev server: `npm run dev`
- Worker: `npm run worker` (runs BullMQ workers for background jobs)
- Typecheck: `npm run typecheck`
- Lint: `npm run lint`
- Test: `npm test`
- Build: `npm run build`
- Prisma Studio: `npm run db:studio`

## Architecture

### Key directories
- `app/routes/` — Remix file-based routing (dashboard, auth, webhooks, recovery redirect)
- `app/models/` — Prisma query helpers (one file per table: shop, checkout, recovery-case, etc.)
- `app/services/` — Business logic (webhook processing, decline detection, recovery workflow, email, Shopify API, reconciliation)
- `app/queues/` — BullMQ queue definitions (webhook, recovery, reconciliation) + Redis connection
- `app/lib/` — Shared utilities (Prisma client, encryption, HMAC verification, Sentry, session)
- `app/components/` — React UI components (DashboardNav, MetricCard, RecoveryCaseRow, SettingsForm)
- `prisma/` — Prisma schema and migrations
- `worker.ts` — BullMQ worker process entry point (run separately from web server)

### Data flow
- **Webhook ingestion:** Shopify → `webhooks.shopify.tsx` (HMAC verify, persist, enqueue) → BullMQ webhook queue → `webhook-processor` service → models
- **Twilio webhooks:** Twilio → `webhooks.twilio.tsx` (signature verify) → delivery status updates + SMS opt-out/opt-in handling
- **Recovery flow:** Decline detection → recovery case created (CANDIDATE) → suppression window → READY → schedule messages → MESSAGING → email sent via Postmark
- **Reconciliation:** Periodic BullMQ jobs query Shopify's `abandonedCheckouts` GraphQL API, update local state, promote/expire cases
- **Suppression:** `orders/create`, `orders/paid`, `orders/cancelled` webhooks suppress or close open recovery cases
- **Dashboard:** Remix loaders query Prisma → React components render metrics, case lists, settings

### Database tables (Prisma)
- `Shop` — Merchant tenancy, encrypted access token, settings
- `WebhookEvent` — Raw event ledger for auditing + idempotency (dedupe on shopId+eventId+topic)
- `Checkout` — Normalized checkout candidates with status tracking
- `PaymentSignal` — Payment evidence (transaction failures, successes, order events)
- `RecoveryCase` — Recovery opportunities with state machine (candidate→ready→messaging→recovered/expired/cancelled)
- `RecoveryMessage` — Outbound message tracking (scheduled, sent, opened, clicked)
- `OrdersIndex` — Fast order lookup for suppression and attribution
- `SmsOptOut` — Phone numbers that opted out of SMS (STOP keyword tracking)

### Recovery case state machine
`CANDIDATE → SUPPRESSED` (success signal during suppression window)
`CANDIDATE → READY` (suppression window passes, no success)
`READY → MESSAGING` (first message sent)
`MESSAGING → RECOVERED` (order paid after message)
`MESSAGING → SUPPRESSED` (customer self-recovers)
`* → CANCELLED` (order cancelled or merchant closes)
`* → EXPIRED` (72-hour TTL exceeded)

## Browser Preview (agent-browser)
- **Installed globally:** `agent-browser` (by Vercel Labs) is available for browser automation
- **Purpose:** Use `agent-browser` to preview and interact with the running app instead of running the dev server in the Codebuff terminal (which floods output and blocks interaction)
- **Workflow:** Start the dev server in a separate terminal, then use `agent-browser` commands to interact:
  - `agent-browser open http://localhost:5173` — open the app
  - `agent-browser snapshot -i` — get a compact accessibility snapshot with interactive element refs
  - `agent-browser click @e1` — click an element by ref
  - `agent-browser fill @e2 "text"` — fill an input
  - `agent-browser screenshot page.png` — capture a screenshot
  - `agent-browser close` — close the browser session
- **Important:** NEVER run `npm run dev` or other long-running dev server commands in the Codebuff terminal. These flood the terminal with continuous output and block interaction. Ask the user to start the dev server in a separate terminal, then use `agent-browser` to interact with the running app.

## Conventions
- **Formatting/linting:** ESLint + Prettier (Remix defaults)
- **Server-only files:** Use `.server.ts` suffix for files that should never be bundled to the client
- **Remix patterns:** Use loaders for data fetching, actions for mutations. No client-side data fetching.
- **DB access:** Always through `app/models/` — no direct Prisma calls from routes
- **Business logic:** Keep in `app/services/` — routes should be thin
- **Background work:** Use BullMQ queues — never do heavy work in request handlers
- **Typing:** Strict TypeScript, no `any` types
- **Imports:** Use `~/` path alias (maps to `app/`)
- **Shopify API:** GraphQL Admin API only (REST is deprecated for new apps)
- **Twilio SMS:** Delivery status tracked via StatusCallback webhooks; opt-out (STOP) and opt-in (START) handled via incoming message webhooks at `/webhooks/twilio`
- **SMS:** Twilio for outbound SMS (see `app/services/sms.server.ts`). Channel routing (which steps use SMS vs email) is merchant-configurable (Phase 2).
- **Secrets:** Never commit `.env` — use `.env.example` with placeholders
- **Encryption:** Shopify access tokens are AES-256-GCM encrypted at rest
