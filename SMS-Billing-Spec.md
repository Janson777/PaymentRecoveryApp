# SMS Billing & Usage Metering — Implementation Spec

**Status:** Draft v2 (post-review)
**Last updated:** 2026-03-14
**Owner:** Engineering
**Changelog:**
- v2 applied review fixes for grandfather flag default, NANP area-code filter, migration order, Phase 1 visibility, Twilio async price, idempotency retention, bundle-boundary math, projection algorithm, refund/downgrade policy.
- v2.1 fixed §8 section numbering, deferred cycle increment to webhook to prevent double-count, clarified FailedUsageRecord resolution.
- v2.2 consolidated webhook flow into §8.2, dropped the unused `estimateSegments` helper, replaced fragile `priceUsdCents IS NULL` guard with an explicit `cycleIncrementedAt` idempotency column.
- v2.3 wrapped the claim-and-increment in a single DB transaction to close a crash-window that could silently under-bill.
- v2.4 extended the §8.5 reconciliation job to also catch orphaned overages from a post-commit/pre-enqueue crash.
**Related files:** `app/services/sms.server.ts`, `app/services/billing.server.ts`, `app/lib/plan.server.ts`, `prisma/schema.prisma`

---

## 1. Context & Motivation

BitPushy currently uses a **single shared Twilio account** (env vars `TWILIO_ACCOUNT_SID`, `TWILIO_AUTH_TOKEN`, `TWILIO_FROM_NUMBER`) to send SMS recovery messages on behalf of all Pro merchants. Merchants **do not** bring their own Twilio credentials — they simply toggle SMS on in settings.

This is the correct architecture (and what Postscript, SMSBump, Klaviyo SMS, and Attentive all do), but it is **incomplete**:

- **No per-merchant usage tracking** — every SMS is on our Twilio bill with no attribution
- **No usage-based billing** — Pro is flat $39/month regardless of how many SMS the merchant sends
- **No hard caps or rate limits** — a single misconfigured merchant could blow out our Twilio bill or get our number pool carrier-banned
- **Misleading settings copy** — the Settings page currently reads "Requires Twilio credentials configured in your environment," which implies BYO-Twilio (it does not; that text is stale)

This spec covers the engineering work required to turn the existing scaffolding into a safe, scalable, and profitable SMS product.

---

## 2. Goals

1. Bill Pro merchants transparently for the SMS they actually send, on top of their $39/month base subscription
2. Guarantee BitPushy cannot lose money on a runaway merchant (hard caps, rate limits)
3. Give merchants real-time visibility into usage and projected spend — zero bill surprises
4. Maintain TCPA/10DLC compliance with a per-message audit trail
5. Migrate existing Pro merchants without forcing a churn event

## 3. Non-Goals (for this phase)

- **International SMS (outside US & Canada).** International pricing variance (~10× between US and Germany) makes a single per-segment price unworkable. Deferred to Phase 2.
- **Per-merchant dedicated sender numbers.** Covered by the separate "A2P 10DLC / Sender Identity" spec (see §15).
- **MMS.** Text only.
- **Two-way SMS conversations.** We already handle STOP/START via `/webhooks/twilio`; nothing more for now.
- **Changing the Free plan.** Free remains 100 cases/month, email-only.

---

## 4. Pricing Model

### 4.1 Pro plan structure (new subscriptions)

| Component | Price | Notes |
|---|---|---|
| Base subscription | **$39.00 / 30 days** | Same as today; unlimited cases + email |
| Included SMS bundle | **500 segments / billing cycle** | Rolls over? No — use it or lose it |
| Overage rate | **$0.04 / segment** | US & Canada only |
| Default Shopify `cappedAmount` | **$50.00 / cycle** | Prevents bill surprise; merchant can raise (re-approval required) |

### 4.2 Why 500 included & $0.04 overage — the economics

**Our cost per US segment (A2P 10DLC):**

| Component | Cost |
|---|---|
| Twilio base SMS | ~$0.0079 |
| Carrier pass-through (10DLC) | ~$0.003 |
| **Total raw cost** | **~$0.011 / segment** |

**Break-even analysis:**

- **500-segment merchant (bundle only):** $5.50 raw SMS cost / $39 revenue — $33.50 toward infra + margin. ✅
- **2,000-segment merchant (500 bundle + 1,500 overage):** $22 cost / $99 revenue — 78% gross margin. ✅
- **10,000-segment merchant:** $110 cost / $419 revenue — 74% gross margin. ✅

**Industry comparison:** Postscript charges ~$0.015/segment on enterprise plans and $0.015–$0.045 on smaller plans. Attentive is $0.02–$0.05. Our $0.04 overage sits comfortably in-market.

### 4.3 Critical: we bill per **segment**, not per message

Twilio charges per **160-character GSM-7 segment** (70 chars for Unicode/emoji). A 320-character message = 2 segments = 2× cost.

**Implication for templates:** We must either:
- **(A)** Enforce a **140-character maximum** on SMS templates (guarantees 1 segment with margin for link), or
- **(B)** Track `numSegments` per message and bill per segment

**Recommendation:** Do both. Enforce 140 chars as a soft validation warning in the template editor; track `numSegments` server-side because customer-name variable substitution can push a 140-char template over. Always bill on actual `numSegments` returned by Twilio.

### 4.4 Display copy

Everywhere we show pricing to merchants, use **"per SMS segment"** — not "per message." Tooltip: *"Most recovery SMS are a single segment. Longer messages (over ~140 characters) may count as 2 segments."*

---

## 5. Shopify Billing Architecture

### 5.1 How Shopify usage billing works

Shopify's `appSubscriptionCreate` supports **line items** of two kinds:

1. `appRecurringPricingDetails` — fixed price per interval (what we use today: $39/30 days)
2. `appUsagePricingDetails` — declares a **capped usage line** with `cappedAmount` and `terms` string

Key constraints:

- Both lines can exist on the **same subscription** — merchant approves once
- `cappedAmount` is a hard limit on billable usage per cycle. Beyond it, `appUsageRecordCreate` returns an error (we must enforce in our code first)
- `cappedAmount` can be raised via `appSubscriptionLineItemUpdate` — this **triggers merchant re-approval** (UI flow unavoidable)
- Usage records are submitted via `appUsageRecordCreate` with `{subscriptionLineItemId, price, description, idempotencyKey}`
- Shopify bills the merchant at the end of the 30-day cycle; we get paid per standard app payout schedule

### 5.2 New Pro subscription structure

```graphql
mutation CreateProV2($returnUrl: URL!) {
  appSubscriptionCreate(
    name: "Pro"
    returnUrl: $returnUrl
    test: false
    lineItems: [
      {
        plan: {
          appRecurringPricingDetails: {
            price: { amount: 39.00, currencyCode: USD }
            interval: EVERY_30_DAYS
          }
        }
      },
      {
        plan: {
          appUsagePricingDetails: {
            cappedAmount: { amount: 50.00, currencyCode: USD }
            terms: "$0.04 per SMS segment beyond your 500-segment monthly bundle. Capped at $50/month by default."
          }
        }
      }
    ]
  ) {
    userErrors { field message }
    confirmationUrl
    appSubscription {
      id
      status
      # REQUIRED: select lineItems.id so we can identify which one is the
      # usage line and persist it to Shop.billingUsageLineItemId.
      lineItems {
        id
        plan {
          pricingDetails {
            __typename
            ... on AppUsagePricingDetails {
              cappedAmount { amount currencyCode }
              terms
            }
          }
        }
      }
    }
  }
}
```

On callback (`/billing/callback`), identify the usage line by `__typename === "AppUsagePricingDetails"` and persist its `id` to `Shop.billingUsageLineItemId`. `appUsageRecordCreate` requires this ID on every call.

---

## 6. Migration Strategy for Existing Pro Merchants

**Problem:** You cannot add a usage line to an existing subscription. Adding it requires cancelling and creating a new subscription, which triggers merchant re-approval and risks churn.

**Solution: Grandfather + voluntary migration.** Do not force any existing merchant through re-approval.

### 6.1 Grandfather rules

Existing Pro merchants (flagged with `planVersion = "v1"`) keep their current $39 flat deal **forever**, with these in-app enforcement rules:

| SMS state | Behavior |
|---|---|
| SMS never enabled | Nothing changes. Ever. No migration prompt. |
| SMS enabled | Hard cap of **500 segments/cycle** enforced in app code. Attempts beyond are queued or dropped with merchant notification. |

### 6.2 Voluntary migration trigger

When a grandfathered merchant **approaches their 500-segment cap** (at 80% and 100%), show:

> **Running out of SMS?** Your plan includes 500 SMS/month. Upgrade to the metered Pro plan to send more — same $39 base + $0.04 per additional segment, capped at $50 by default. [Upgrade →]

Clicking triggers (strict order — DO NOT cancel first):

1. Call `appSubscriptionCreate` with the new v2 structure → receive `confirmationUrl`
2. Redirect merchant to `confirmationUrl` to approve
3. Merchant approves → Shopify redirects to `/billing/callback?charge_id=<v2_gid>`
4. In callback: verify v2 subscription is `ACTIVE`, persist `billingUsageLineItemId` and set `planVersion = "v2"`
5. **Only now** call `appSubscriptionCancel` on the old v1 subscription
6. If the merchant abandons step 2 (never approves), the v1 subscription stays intact — they remain on their grandfathered plan with no disruption

If step 5 fails (rare), a daily reconciliation job sweeps for Pro shops with multiple active subscriptions and cancels the older one.

### 6.3 New Pro subscriptions

All new Pro subscriptions created after v2 ships get the dual-line structure. No grandfather flag needed.

---

## 7. Schema Changes

### 7.1 `Shop` — new columns

```prisma
model Shop {
  // ... existing fields ...

  // Billing v2 (SMS metering)
  planVersion            String    @default("v1")       // "v1" = grandfathered flat, "v2" = metered. Default is v1 so migrations don't accidentally
                                                         // flag existing Pro merchants as v2 (they'd be missing billingUsageLineItemId). Code sets
                                                         // planVersion = "v2" only after a successful v2 appSubscriptionCreate + activation.
  billingUsageLineItemId String?                         // Shopify GID of the usage line (only set for v2)
  billingCycleStart      DateTime?                       // Anchor for usage counters (rolling 30d from this)
  smsHardCapSegments     Int       @default(500)        // Merchant-configurable hard cap; we stop sending beyond this
  smsSoftCapPercent      Int       @default(80)         // Email warning threshold
  smsRateLimitPerHour    Int       @default(100)        // Safety net; admin-configurable (daily cap is the binding constraint; see §11.3)
  smsRateLimitPerDay     Int       @default(1000)
}
```

**Required data migration step (must run before Phase 1 enforcement):**

```sql
-- Grandfather every existing Pro merchant explicitly. Default is already "v1"
-- for fresh rows, but existing rows need a backfill because the column is new.
UPDATE "Shop" SET "planVersion" = 'v1'
  WHERE "planTier" = 'PRO' AND "billingSubscriptionId" IS NOT NULL;

-- For existing Pro merchants with prior SMS volume, set a cap that won't
-- immediately cut them off (see Phase 1 note in §13).
UPDATE "Shop" SET "smsHardCapSegments" = GREATEST(500, CEILING(<trailing_30d_segments> * 1.5))
  WHERE "planTier" = 'PRO';
```

### 7.2 `RecoveryMessage` — new columns

```prisma
model RecoveryMessage {
  // ... existing fields ...

  numSegments        Int?       // Twilio-reported segment count (null until StatusCallback arrives)
  priceUsdCents      Int?       // Our cost in cents (Twilio rate + carrier fee), tracked for analytics
  billedUsdCents     Int?       // What we billed merchant (0 if within bundle, >0 if overage)
  consentSource      String?    // e.g. "checkout_phone_field" — TCPA audit trail
  countryCode        String?    // ISO-3166-1 alpha-2, e.g. "US"
  usageRecordGid     String?    // Shopify usage record GID (only for overage)
  cycleIncrementedAt DateTime?  // Idempotency guard: set by the first StatusCallback that
                                // increments SmsUsageCycle. Subsequent webhooks for the same
                                // message see a non-null value and skip the increment.
}
```

### 7.3 New table: `SmsUsageCycle`

Rather than recomputing usage on every send, maintain a rolling counter per merchant per billing cycle.

```prisma
model SmsUsageCycle {
  id                   Int      @id @default(autoincrement())
  shopId               Int
  cycleStart           DateTime
  cycleEnd             DateTime
  segmentsSent         Int      @default(0)      // Across all messages accepted by Twilio
  segmentsIncluded     Int      @default(500)    // Bundle size snapshot at cycle start
  segmentsOverage      Int      @default(0)      // = max(0, segmentsSent - segmentsIncluded)
  overageBilledCents   Int      @default(0)      // Running total billed to merchant
  rawCostCents         Int      @default(0)      // Running Twilio cost (ours)
  createdAt            DateTime @default(now())
  updatedAt            DateTime @updatedAt

  shop Shop @relation(fields: [shopId], references: [id])

  @@unique([shopId, cycleStart])
  @@index([shopId, cycleEnd])
}
```

A new cycle row is created lazily on first send within a cycle, or via scheduled cycle-rollover job.

### 7.4 New table: `SmsRateLimitBucket` (optional, Redis-backed alternative)

For per-merchant rate limiting, prefer Redis counters over a DB table. Keys:

```
ratelimit:sms:{shopId}:hour:{YYYYMMDDHH}   TTL 1h
ratelimit:sms:{shopId}:day:{YYYYMMDD}      TTL 1d
```

Increment atomically before each send; reject if either exceeds the cap.

---

## 8. Send-Time Flow (the critical path)

Location: `app/services/recovery-send.server.ts` → calls `sendRecoverySMS`.

### 8.1 Pre-send gates (ALL must pass)

```
1.  Phone is E.164 + country code in {US, CA}      →  else skip + log "unsupported_country"
2.  Phone not in SmsOptOut                         →  else skip + log "opted_out"
3.  Merchant planTier === "PRO"                    →  else skip + log "plan_not_eligible"
4.  Hourly rate limit not exceeded                 →  else defer + log "rate_limit_hour"
5.  Daily rate limit not exceeded                  →  else defer + log "rate_limit_day"
6.  smsHardCapSegments not reached                 →  else skip + nudge banner + log "hard_cap_reached"
7.  (If v2) Shopify cappedAmount not reached       →  else skip + raise-cap nudge + log "shopify_cap_reached"
```

All gate failures are logged to `RecoveryMessage.deliveryStatus` with a distinct reason code so merchants can diagnose delivery gaps.

### 8.2 Happy path

```
1.  Increment Redis rate-limit counters (atomic)
2.  Call twilio.messages.create(...)
     - Twilio returns: { sid, numSegments?, price?, priceUnit?, status }
     - IMPORTANT: numSegments and price are OFTEN NULL on the initial response
       (status = "queued" or "accepted"). They are populated by Twilio's
       StatusCallback webhook once the carrier accepts the message.
3.  Persist on RecoveryMessage (partial — what we know now):
     - providerMessageId = sid
     - numSegments = numSegments     // may be null; authoritative value arrives via webhook
     - priceUsdCents = null           // filled in by webhook
     - cycleIncrementedAt = null      // idempotency guard for step 6
     - consentSource = "checkout_phone_field"
     - countryCode = extractCountry(toPhone)
     - deliveryStatus = "queued"
4.  Do NOT increment SmsUsageCycle yet. The authoritative segment count comes from the
     StatusCallback webhook (step 6). Pre-send rate-limit gates already protected against
     burst abuse, so the cycle table doesn't need to be live-accurate between send and
     webhook. This avoids the double-count / miss-boundary bug that arises from incrementing
     an estimate and then reconciling.
5.  Emit structured log + metric (sms.queued)

--- Later, in the /webhooks/twilio StatusCallback handler ---

6.  On first status in {"sent", "delivered"} per message.
     Wrap ALL of the following in a single DB transaction so a crash between
     the claim and the cycle increment rolls back the claim (prevents silent
     under-billing):

         BEGIN;

         -- (a) Atomic claim — if another webhook already processed this
         --     message, this returns zero rows and we exit the transaction.
         UPDATE RecoveryMessage SET cycleIncrementedAt = now()
           WHERE id = :id AND cycleIncrementedAt IS NULL RETURNING *;

         -- If no row claimed: ROLLBACK and stop.

         -- (b) Update authoritative carrier values
         UPDATE RecoveryMessage SET numSegments = :num, priceUsdCents = :price
           WHERE id = :id;

         -- (c) Upsert cycle row, increment segmentsSent atomically
         INSERT INTO SmsUsageCycle (/* shopId, cycleStart, cycleEnd, segmentsIncluded, segmentsSent */)
           VALUES (...)
           ON CONFLICT (shopId, cycleStart)
           DO UPDATE SET segmentsSent = SmsUsageCycle.segmentsSent + :num;

         -- (d) Compute overage and set RecoveryMessage.billedUsdCents
         --     (see §8.3 for the atomic-segment algorithm)

         COMMIT;

     After commit, outside the transaction:
     - If billedUsdCents > 0, enqueue ShopifyUsageRecordJob
     - Emit sms.sent / sms.delivered metric

     Ordering rationale: the ShopifyUsageRecordJob enqueue is deliberately
     outside the transaction because BullMQ enqueues are not transactional
     with Postgres. A post-commit enqueue can be retried safely (the job's
     own idempotency key prevents double-billing); a pre-commit enqueue
     could fire a job for a transaction that later rolls back.
```

### 8.3 Bundle boundary — segments are atomic

Segments are Twilio's billing unit; you cannot bill 0.5 of a segment. When a multi-segment message straddles the bundle boundary, only the segments *past* the boundary are overage.

**Example:** bundle = 500, `segmentsSent` before this message = 499. A 2-segment message arrives.

- Pre-send: `segmentsSent = 499`, `segmentsIncluded = 500`
- Post-send: `segmentsSent = 501`
- Bundled portion: `min(2, 500 - 499) = 1` segment → free
- Overage portion: `2 - 1 = 1` segment → billed at 4¢
- `RecoveryMessage.billedUsdCents = 4`

Algorithm:
```ts
const prior = cycle.segmentsSent - message.numSegments;      // state before this msg
const bundledPortion = Math.max(0, Math.min(message.numSegments, cycle.segmentsIncluded - prior));
const overageSegments = message.numSegments - bundledPortion;
const billedCents = overageSegments * 4;
```

### 8.4 Background job: `ShopifyUsageRecordJob`

Do not block the SMS send on Shopify API availability. Separate BullMQ job:

```ts
{
  recoveryMessageId: number,
  priceCents: number,
  idempotencyKey: string  // = `msg-${recoveryMessageId}` — scoped, stable, DB-unique
}
```

- Retries: 5 with exponential backoff (30s, 2m, 10m, 1h, 6h) — **all retries complete within ~8h**
- Shopify's `idempotencyKey` deduplicates for a rolling window (currently ~24h per Shopify docs; verify at implementation time). Our retry schedule sits well inside this window. **If a job re-runs manually days later (ops intervention), it may double-bill** — operator runbook must check `RecoveryMessage.usageRecordGid` before re-enqueuing.
- After 5 failures → insert into `FailedUsageRecord` table (see §8.5), page on-call, exclude from `overageBilledCents` total until resolved
- On success, write `RecoveryMessage.usageRecordGid` and, if a matching `FailedUsageRecord` row exists, set its `resolvedAt = now()` (we preserve the row for audit trail rather than deleting)

**Do not** attempt to refund usage records on delivery failure. Shopify does not accept negative usage, and Twilio has already charged us. Delivery failures (<2% industry average) are absorbed as cost of doing business.

### 8.5 Failed usage record recovery

New table:

```prisma
model FailedUsageRecord {
  id                Int       @id @default(autoincrement())
  recoveryMessageId Int       @unique
  shopId            Int
  priceCents        Int
  lastError         String
  attemptCount      Int       @default(5)
  resolvedAt        DateTime?
  createdAt         DateTime  @default(now())
  updatedAt         DateTime  @updatedAt
}
```

A daily reconciliation job runs two scans:

1. **Retry known failures.** Scan `FailedUsageRecord` with `resolvedAt IS NULL`, re-attempt each with the same idempotency key, set `resolvedAt = now()` on success. If >24h old and Shopify's idempotency window has likely expired, the operator must manually verify no matching `appUsageRecord` exists on the subscription before using a **new** idempotency key (`msg-${id}-retry-${attemptCount}`).

2. **Catch orphaned overages.** Scan for rows that should have been billed but weren't (closes the post-commit / pre-enqueue crash window):

   ```sql
   SELECT id, recoveryCaseId, billedUsdCents FROM "RecoveryMessage"
    WHERE billedUsdCents > 0
      AND usageRecordGid IS NULL
      AND updatedAt < now() - INTERVAL '1 hour'
      AND NOT EXISTS (
        SELECT 1 FROM "FailedUsageRecord" f
         WHERE f.recoveryMessageId = "RecoveryMessage".id
           AND f.resolvedAt IS NULL
      );
   ```

   For each row, enqueue `ShopifyUsageRecordJob` (using the same stable idempotency key `msg-${id}`). The 1-hour delay gives the normal happy path time to resolve itself before we intervene.

> **Cadence note.** A daily reconciliation means the worst-case orphan age is ~24h, which sits right at the edge of Shopify's ~24h idempotency retention window. If Shopify's window has expired by the time we retry, the idempotency key is no longer protective and the operator runbook (see §12.3) must manually verify no matching `appUsageRecord` exists before retrying. **Recommendation: run the reconciliation job hourly instead of daily** — scans are cheap (indexed, near-empty) and this keeps every orphan recoverable automatically.

---

## 9. Webhook-Time Flow

`/webhooks/twilio` (existing route) receives delivery status callbacks. The segment-count reconciliation and cycle-increment logic lives in **§8.2 step 6** — don't implement it here as well. This section covers the remaining delivery-status handling:

- On status `sent` / `delivered`: run §8.2 step 6 (idempotent), then update `RecoveryMessage.deliveryStatus` and log metric
- On status `failed` or `undelivered`:
  - Update `deliveryStatus` to the reported value
  - Log carrier error code for operational review
  - **Do NOT** revert usage counter or refund — see §8.4
- On STOP keyword (already handled): existing opt-out flow

---

## 10. Merchant-Facing UI

### 10.1 New panel on `/dashboard/settings` → "SMS Usage" (Pro only)

```
┌─────────────────────────────────────────────────────────┐
│ SMS Usage · Current cycle Mar 14 – Apr 13               │
│                                                         │
│    ████████████░░░░░░░░░░░  412 / 500 segments          │
│                                                         │
│  Included in Pro: 500 · Overage so far: 0 ($0.00)       │
│  Projected this cycle: 620 segments (~$4.80 overage)    │
│                                                         │
│  Delivered: 394 · Failed: 6 · Opted out: 2              │
│                                                         │
│  Hard cap: [500  ▾] segments                            │
│  Email me at: [80  ▾] % of cap                          │
│  [Raise Shopify billing cap ($50)]  ← re-approval flow  │
└─────────────────────────────────────────────────────────┘
```

### 10.2 Dashboard overview banner additions

Add to the existing `UsageLimitBanner` pattern (same file, new variant):

- **80–99% of hard cap:** amber — "Approaching your SMS limit — 412 of 500 segments used."
- **100% of hard cap:** red — "SMS limit reached. New SMS are paused until next cycle or until you raise the cap."
- **Grandfathered v1 + approaching cap:** purple — upgrade nudge to v2 (§6.2)

### 10.3 Historical view (Phase 1.5 — optional at launch)

Bar chart of last 6 cycles: segments sent, overage $, delivery rate. Nice-to-have; not blocking.

---

## 11. Safety & Compliance

### 11.1 Template length validation

In `SettingsForm` SMS template fields:

- Count chars live as merchant types (account for `{{firstName}}` variable expansion — assume 20-char worst case)
- Show: `142 / 140 chars · 1 segment`
- At 141+: warning pill `"~2 segments · doubles your cost per send"` (not a block — some merchants may accept the cost consciously)

### 11.2 TCPA audit trail

Every `RecoveryMessage` with `channel = SMS` must have `consentSource` set. Initial value: `"checkout_phone_field"` (implicit consent basis: customer voluntarily provided phone for transactional communication about their own order).

If regulatory posture changes (e.g. FCC rulings tighten implicit consent), add an explicit consent checkbox to the recovery URL landing page and log `consentSource = "explicit_opt_in"`.

### 11.3 Rate limits (defense in depth)

Three layers, any one triggers a defer:

| Scope | Default limit | Configurable by |
|---|---|---|
| Per-merchant / hour | 100 segments | Engineering (raise on request) |
| Per-merchant / day | 1,000 segments | Engineering |
| Global (whole app) | 10,000 segments / hour | Engineering (via env var) |

**Note:** 100/hr × 24 = 2,400/day, but the day cap is 1,000 — so **the daily cap is the binding per-merchant constraint** in practice. The hourly cap prevents burst-abuse within a single hour; the daily cap prevents sustained overvolume.

Deferred messages go back in the queue with `scheduledFor += 1h`. If still blocked after 4h, mark as `failed_rate_limit` and alert.

### 11.4 Phone validation

- Strict E.164 via existing `normalizePhoneValue`
- Reject numbers in the NANP "reserved for fiction" ranges (555-0100 through 555-0199)
- **NANP is NOT just US/CA.** `+1` also routes to Caribbean countries (Jamaica +1876, Trinidad +1868, Bahamas +1242, Barbados +1246, and many more) at **5–10× US rates** (up to $0.10/segment Twilio cost). A naive "+1 allowed" filter is a real economic risk.
- **Required approach:** maintain an **allowlist of US + Canadian area codes** (see `NANP_US_CA_AREA_CODES` constant — source from NANPA's public registry, refresh quarterly via a CI check). Any `+1` number whose NPA (first 3 digits after the +1) isn't in the allowlist is rejected with reason `unsupported_region`.
- Alternative: **Twilio Lookup API** ($0.005/number) returns `country_code` reliably. At launch volume (<50k/month) this costs ~$250/mo — acceptable insurance against the Caribbean rate spike. Recommended for Phase 1.
- Pick one (allowlist OR Lookup) before Phase 1 ships. Don't ship without either.

### 11.5 Idempotency — three layers

1. **Enqueue:** Check `RecoveryCase.recoveryMessages` for existing `(sequenceStep, channel)` row before creating new
2. **Send:** Twilio's own idempotency isn't on by default; wrap `messages.create` in a DB lock on `RecoveryMessage.id`
3. **Usage record:** `appUsageRecordCreate` `idempotencyKey = String(RecoveryMessage.id)` — Shopify deduplicates server-side

---

## 12. Operational Runbook

### 12.1 "A merchant is sending way too much SMS"

1. Check `SmsUsageCycle` for their current cycle
2. If hard cap is working: system is doing its job; notify merchant if they want to raise it
3. If hard cap is NOT working: incident — admin-set `smsHardCapSegments = 0` on their `Shop` row to stop sends immediately
4. Check Redis rate-limit keys to confirm enforcement
5. Review `SmsUsageCycle.rawCostCents` for our exposure

### 12.2 Twilio outage

- SMS sends will throw from `twilio.messages.create`
- `RecoveryMessage` marked `deliveryStatus = "failed_provider"`
- Job retries: 3 with backoff. After 3, give up (don't blast when Twilio recovers)
- Email fallback: if step was SMS and failed 3× → auto-reschedule as EMAIL if available, log reason

### 12.3 Shopify billing API outage

- `ShopifyUsageRecordJob` retries 5× with backoff (§8.3)
- SMS sends continue uninterrupted — we take the short-term cost
- After 5 failures: on-call alert, manual review, potential manual record creation

### 12.4 Cycle rollover

Scheduled BullMQ job runs **daily at 00:05 UTC** (single run, no per-timezone logic — cycles are anchored to each merchant's activation timestamp, not to local midnight):

```
For each Shop where billingCycleStart + 30d <= now():
  Upsert SmsUsageCycle(
    shopId,
    cycleStart = Shop.billingCycleStart + 30d,
    cycleEnd   = Shop.billingCycleStart + 60d,
    segmentsIncluded = 500        // TODO: read from Shop.segmentsBundledPerCycle once Enterprise tier exists
  )  // uses @@unique([shopId, cycleStart]) — idempotent if job runs twice
  Update Shop.billingCycleStart = Shop.billingCycleStart + 30d
```

The job is safe to run multiple times per day (the unique index makes the upsert a no-op after the first success). Lazy creation on first send (§7.3) handles cases where the job is delayed by up to 24h. If the job is down for >24h, a send could land in a stale cycle — monitored via a "cycle-lag" metric.

Free merchants reset on calendar-month boundary (no subscription anchor), matching `FREE_CASES_LIMIT` behavior today.

---

## 13. Rollout Plan

### Phase 1 — Foundations (minimally merchant-visible)

> ⚠️ **Honest framing:** enforcing a hard cap of 500/cycle on existing Pro merchants who previously had no cap IS a merchant-visible change. Any merchant currently sending >500 segments/cycle will be cut off. Phase 1 must mitigate this.

- [ ] Schema migrations (`Shop` columns, `RecoveryMessage` columns, `SmsUsageCycle` table, `FailedUsageRecord` table)
- [ ] Backfill `planVersion = "v1"` for all existing Pro merchants (§7.1 migration SQL)
- [ ] **Compute trailing-30d SMS volume per merchant** and set initial `smsHardCapSegments = GREATEST(500, ceil(prior_volume * 1.5))` so no merchant is surprise-capped
- [ ] Record `numSegments` + `priceUsdCents` on every send (read-only metering; reconciled via StatusCallback per §8.2)
- [ ] Rate-limit enforcement (100/hr, 1000/day per merchant)
- [ ] Hard cap enforcement (using dynamically-set values from step 3)
- [ ] Region filter: area-code allowlist OR Twilio Lookup (§11.4) — one must ship
- [ ] **Email existing Pro merchants** with new-cap transparency: "Your SMS limit this cycle: X segments. You can raise or lower this in Settings."
- [ ] Fix misleading "configure Twilio credentials" copy on Settings page (see §17)
- [ ] Deploy + verify metrics look sensible for 1 week

### Phase 2 — Merchant-facing (still no billing change)

- [ ] New SMS Usage panel on Settings (current cycle progress, delivered/failed breakdown)
- [ ] Dashboard banner for approaching hard cap
- [ ] FAQ updates ("Do I need my own Twilio account?", "How is SMS priced?")
- [ ] Merchant-configurable soft/hard caps

### Phase 3 — v2 billing (the big one)

- [ ] `appSubscriptionCreate` dual-line structure for NEW subscriptions
- [ ] `ShopifyUsageRecordJob` queue + retry logic
- [ ] Raise-cap flow (merchant re-approval for higher `cappedAmount`)
- [ ] Voluntary migration prompt for grandfathered merchants
- [ ] v2 is default for all new Pro signups

### Phase 4 — Polish

- [ ] Historical usage charts (last 6 cycles)
- [ ] Projected spend calculation on dashboard
- [ ] Email alerts at 80% and 100% of hard cap
- [ ] Twilio Lookup integration (landline filter) — gated on volume

---

## 14. Test Plan

### Unit

- `SmsUsageCycle` row creation + atomic increment
- Rate-limit gate logic (all three layers)
- Country code extraction + rejection
- Overage calculation at bundle boundary (412 sent, next msg = 2 segments → 1 bundled + 1 overage)
- Idempotency: double-enqueue → single send → single usage record

### Integration

- Full recovery flow: Shopify webhook → case → SMS → usage cycle updated → Shopify usage record created
- Hard cap enforcement: send N up to cap, next send gets `deliveryStatus = hard_cap_reached` without calling Twilio
- Grandfather path: v1 merchant hits bundle limit, upgrade prompt surfaces, flow works end-to-end
- Twilio webhook: `failed` status updates DB but does NOT revert usage

### Load / safety

- 10k-segment merchant in a single day: confirm rate-limit defers cleanly, no memory/DB pressure
- Shopify API 500s during `appUsageRecordCreate`: retries work, no double-billing, no SMS interruption
- Redis outage: rate limiter falls back to DB count (slower but correct)

---

## 15. Open Questions & Dependencies

### Explicit dependencies on other specs

- **A2P 10DLC / Sender Identity** — must be registered before we can send production-volume US SMS. Separate spec. Affects cost (brand registration + campaign fees).
- **Toll-Free Verification** — alternative path for low-volume merchants. Separate spec.

### Deliberately deferred

- **Multiple currencies.** All billing is USD today (both our Twilio cost and merchant billing). Shopify's merchant-facing currency is a display concern that doesn't affect our USD-denominated usage records.
- **International SMS.** Re-evaluate in 6 months with real US/CA data; likely adds country-tiered pricing.
- **MMS / RCS.** Out of scope.

### Needs product decision

- **Annual Pro plan?** Currently monthly only. If we offer annual, do bundled SMS also become annual (6,000 instead of 500/mo) or stay monthly?
- **Enterprise tier?** At what volume (e.g. 10k+ segments/month) should we introduce a custom plan?
- **Black Friday surge allowance?** Many merchants legitimately want to send 10× normal volume in a 72-hour window. Product decision needed on automatic seasonal cap relaxation vs. manual request flow.
- **Refund / dispute policy.** When a merchant disputes an overage charge, our options are: (a) credit next cycle (Shopify supports `appSubscriptionLineItemUpdate` or manual `AppCredit`), (b) refund via Shopify's appeal process, (c) goodwill credit outside Shopify. Default policy proposal: first dispute of a cycle credited without question; repeated disputes require engineering review. Needs legal sign-off before launch.
- **Mid-cycle downgrade (Pro → Free).** When a merchant downgrades mid-cycle:
  1. Already-submitted `appUsageRecord`s stay billed (Shopify's policy; we cannot reverse)
  2. We stop sending SMS immediately upon downgrade
  3. No new usage records are created
  4. The merchant sees a final partial-cycle charge on their next Shopify invoice
  This behavior should be disclosed in the downgrade confirmation dialog.
- **Projection algorithm for "Projected this cycle" UI (§10.1).** Recommended: linear extrapolation — `projected = segmentsSent * (cycleDays / daysElapsed)`, rounded up. Simple, matches merchant mental model. Revisit if seasonal burn patterns make this misleading.

---

## 16. FAQ Updates (website)

New entries to add to `website/lib/faq-content.tsx` under "Pricing & Billing":

**Do I need my own Twilio account?**
> No. BitPushy handles SMS delivery through our infrastructure — you don't need to sign up for Twilio, register a number, or configure anything technical. Just toggle SMS on in Settings once you're on Pro.

**How is SMS priced?**
> Every Pro subscription includes 500 SMS segments per billing cycle. Beyond that, additional segments are $0.04 each, billed through Shopify alongside your subscription. Your bill is capped at $50 per cycle by default — you can raise or lower this in Settings.
>
> Most recovery SMS are a single segment. Longer messages (more than ~140 characters) can count as two segments. You'll always see a preview and exact segment count before you save a template.

**Can I control how much I spend on SMS?**
> Yes, in three ways: (1) a hard cap in Settings that stops SMS sends at a number you choose, (2) a soft warning email when you hit 80% of that cap, and (3) a Shopify-level billing cap that Shopify itself enforces. You're always in control.

**Which countries do you support SMS for?**
> SMS recovery is available for US and Canadian phone numbers today. Customers outside North America automatically fall back to email. International SMS support is on our roadmap.

---

## 17. Settings Page Copy Fix (ship-before-anything-else)

Current misleading copy in `app/components/SettingsForm.tsx`:

> Requires Twilio credentials configured in your environment.

Replace with:

> SMS is included with Pro — your plan includes 500 SMS segments per cycle, with additional segments billed at $0.04 through Shopify.

This one line removes the single biggest source of merchant confusion and costs us ~5 minutes to ship. It should go out as an independent PR ahead of the rest of this spec.

---

## Appendix A — Twilio message payload reference

Relevant fields from `messages.create` response we persist:

```json
{
  "sid": "SMxxxxxxxx",
  "num_segments": "1",
  "price": "-0.00790",        // Negative = charge to us; parse as positive
  "price_unit": "USD",
  "status": "queued",
  "to": "+15551234567",
  "from": "+15559876543",
  "error_code": null
}
```

Carrier 10DLC surcharges are **not** in this response — Twilio applies them at invoicing. For cost tracking we add a fixed `$0.003` adjustment per US segment in `priceUsdCents` computation; actual reconciliation happens monthly against the Twilio invoice (out-of-band, accounting task).

## Appendix B — Glossary

- **Segment:** A single 160-char GSM-7 unit (or 70-char Unicode). Twilio's billing unit.
- **A2P 10DLC:** Application-to-Person 10-Digit Long Code. The sanctioned US delivery method for business SMS as of 2023.
- **Capped amount:** Shopify's per-cycle limit on usage billing. Enforced by Shopify; we also enforce in code.
- **Cycle:** 30 days from Shopify subscription activation, NOT calendar month.
- **Planversion v1 vs v2:** v1 = flat $39, grandfathered; v2 = $39 + metered usage line.
