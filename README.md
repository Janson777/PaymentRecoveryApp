# PaymentRecoveryApp

[![CI](https://github.com/Janson777/PaymentRecoveryApp/actions/workflows/ci.yml/badge.svg?branch=main)](https://github.com/Janson777/PaymentRecoveryApp/actions/workflows/ci.yml)

Shopify app that recovers sales lost to declined payments. Detects failed payment events via webhooks, classifies them as confirmed declines or likely late-stage abandonments, and sends targeted recovery emails to bring customers back to checkout.

## Tech Stack

- **Framework:** Remix v2 (React + TypeScript)
- **Runtime:** Node.js 20+
- **Database:** PostgreSQL (via Prisma ORM)
- **Queue / Cache:** Redis + BullMQ
- **Email:** Postmark
- **SMS:** Twilio
- **Hosting:** Render
- **Styling:** Tailwind CSS
- **Testing:** Vitest

## Quickstart

```bash
# Install dependencies
npm install

# Copy environment config
cp .env.example .env  # then fill in values

# Set up the database
npx prisma migrate dev

# Start the dev server
npm run dev

# Start the background worker (separate terminal)
npm run worker
```

## Scripts

| Command | Description |
|---|---|
| `npm run dev` | Start development server |
| `npm run worker` | Start BullMQ background workers |
| `npm run build` | Production build |
| `npm run typecheck` | TypeScript type checking |
| `npm run lint` | ESLint + Prettier |
| `npm test` | Run tests |
| `npm run test:coverage` | Run tests with coverage enforcement |
| `npm run db:studio` | Open Prisma Studio |

## Architecture

```
app/
├── routes/        # Remix file-based routing (dashboard, auth, webhooks)
├── models/        # Prisma query helpers (one file per table)
├── services/      # Business logic (webhook processing, decline detection, recovery)
├── queues/        # BullMQ queue definitions + Redis connection
├── lib/           # Shared utilities (Prisma client, encryption, HMAC, session)
├── components/    # React UI components
└── test/          # Test setup
prisma/            # Schema and migrations
worker.ts          # BullMQ worker entry point
```

### Data Flow

1. **Webhook ingestion:** Shopify → HMAC verify → persist → BullMQ → process
2. **Recovery flow:** Decline detected → CANDIDATE → suppression window → READY → MESSAGING → email/SMS sent
3. **Reconciliation:** Periodic jobs query Shopify GraphQL API → update local state → promote/expire cases
4. **Suppression:** Order webhooks suppress or close open recovery cases

### Recovery Case State Machine

```
CANDIDATE → SUPPRESSED  (success signal during suppression window)
CANDIDATE → READY       (suppression window passes, no success)
READY     → MESSAGING   (first message sent)
MESSAGING → RECOVERED   (order paid after message)
MESSAGING → SUPPRESSED  (customer self-recovers)
*         → CANCELLED   (order cancelled or merchant closes)
*         → EXPIRED     (72-hour TTL exceeded)
```

## License

Private — All rights reserved.

