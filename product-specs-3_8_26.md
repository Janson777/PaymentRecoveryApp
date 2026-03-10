# Product Specs

Below is a **structured product specification** that keeps the app compliant with Shopify’s ecosystem while still delivering the “payment recovery” outcome.

---

## Declined Payment Recovery App — Product Specification (Shopify)

### 1. Product Vision

**Mission**

Recover sales lost when customers abandon checkout after a declined payment.

**Core Value Proposition**

> Convert failed payment attempts into completed orders by guiding customers back to checkout with targeted recovery messaging.

The app does **not process payments** and does **not modify Shopify checkout**.\
Instead it **detects declined payment events and initiates recovery workflows.**

---

## 2. Problem Definition

When a customer’s payment fails at checkout:

1. Shopify immediately displays an error message.

2. The customer must retry manually.

3. Many customers abandon the checkout.

Common reasons include:

- fraud checks

- insufficient funds

- bank authorization delays

- incorrect billing information

- card network errors

Even when the customer **intends to buy**, the purchase is often lost.

Shopify’s default solution:

- generic abandoned checkout email

Limitations:

- not decline-specific

- not optimized timing

- no payment suggestions

- no analytics

---

## 3. Product Positioning

This app is **not a payment processor**.

It is a **conversion recovery tool**.

Positioning:

> Recover sales lost due to declined payments.

Category:

- conversion optimization

- checkout recovery

- revenue recovery

---

## 4. Shopify Platform Compliance

To avoid conflicts with Shopify payments:

The app will **only respond to events** and **direct customers back to Shopify checkout**.

Allowed integrations

Shopify APIs used:

- Webhooks

- Orders API

- Checkout API

- Admin API

Events monitored:

- checkout/update

- checkout/create

- order/cancelled

- payment_failed (when available)

---

Explicitly avoided

The app will NOT:

❌ process credit card payments\
❌ store payment information\
❌ replace Shopify payment gateways\
❌ interfere with checkout authorization\
❌ modify Shopify payment flows

This keeps the app **outside PCI scope**.

---

## 5. Core System Architecture

The system consists of four primary components.

1\. Shopify Event Listener

Receives webhook events related to checkout and order activity.

Purpose:

Detect potential declined payment abandonment events.

---

2\. Decline Detection Engine

Identifies when a checkout was abandoned **after a payment failure**.

Signals may include:

- payment error event

- checkout reached payment step but no order created

- rapid checkout abandonment after payment attempt

---

3\. Recovery Workflow Engine

Schedules and manages recovery attempts.

Controls:

- message timing

- retry sequences

- payment suggestions

---

4\. Merchant Analytics Dashboard

Displays recovery performance and insights.

---

## 6. Core Features

### Feature 1 — Declined Payment Detection

The system detects when a payment attempt failed and the customer left checkout.

Possible indicators:

- payment error returned by gateway

- checkout reached payment stage but no order created

- checkout abandoned shortly after payment step

Captured data:

- checkout ID

- customer email

- cart contents

- payment method attempted

- failure timestamp

---

## Feature 2 — Smart Recovery Messaging

Send targeted messaging specifically referencing payment issues.

Example email:

> Subject: Your payment didn’t go through — your cart is still saved

Body:

> It looks like your payment didn’t complete.\
> Your items are still reserved — complete your order here.

Includes a **secure checkout link**.

---

## Feature 3 — Recovery Checkout Link

The app generates a direct return link to the saved checkout.

Customer flow:

Customer clicks link\
→ checkout loads with cart restored\
→ customer retries payment

---

## Feature 4 — Intelligent Retry Timing

Recovery messages are scheduled based on behavior patterns.

Example sequence:

Retry 1 → 15 minutes\
Retry 2 → 4 hours\
Retry 3 → 24 hours

Timing is configurable by the merchant.

Future versions may optimize timing automatically.

---

## Feature 5 — Alternative Payment Suggestions

If the original payment method failed, suggest alternatives.

Example suggestions:

- PayPal

- Shop Pay

- Apple Pay

- Klarna

Example message addition:

> If your card didn’t work, you can try PayPal or Shop Pay for a faster checkout.

This increases the chance of recovery.

---

## Feature 6 — Multi-Channel Recovery

Channels supported:

Email (default)

Future support:

- SMS

- WhatsApp

- push notifications

---

## 7. Merchant Dashboard

The dashboard focuses on **recovered revenue metrics**.

Key Metrics

Recovered Revenue

Example:

Recovered sales: $2,450

---

Recovery Rate

Example:

```
Recovered orders / declined payment abandonments
```

---

Decline Recovery Funnel

Visualization:

Declined payment attempts\
 → recovery messages sent\
 → recovery link clicks\
 → completed orders

---

Recovery Channel Performance

Compare effectiveness of:

- email

- SMS

---

## 8. Merchant Configuration

Merchants can configure:

Recovery triggers

Enable recovery for:

- payment decline

- checkout abandonment after payment stage

---

Retry schedule

Customizable sequence:

Example:

```
15 minutes
4 hours
24 hours
```

---

Message templates

Editable templates for:

- email subject

- email body

- SMS messages

Dynamic variables:

- customer name

- product name

- checkout link

---

## 9. Optional Advanced Features (Future)

### AI Retry Optimization

Automatically determine the best retry timing.

Example insight:

> Customers in the US recover best within 2 hours.

---

### Payment Failure Insights

Dashboard explaining common failure patterns.

Example:

- 40% insufficient funds

- 22% authentication failures

---

### Country Decline Analytics

Track decline rates by region.

---

### A/B Testing Recovery Messages

Test different messaging strategies.

---

## 10. MVP Feature Set

The initial version should include:

1. Declined payment detection

2. Recovery checkout link

3. Email recovery sequence

4. Basic merchant dashboard

5. Merchant message templates

This keeps the MVP **fast to build and validate**.

---

## 11. Success Metrics

Target metrics for merchants:

Recovery rate:

```
5–15%
```

Recovered revenue:

```
$500–$5,000/month per store
```

Merchant ROI:

Example:

```
App cost: $29/month
Recovered revenue: $900
```

---

## 12. Pricing Strategy

Simple SaaS pricing.

Starter\
 $19/month

Includes:

- email recovery

- basic analytics

---

Growth\
 $49/month

Includes:

- advanced retry timing

- detailed analytics

---

Pro\
 $99/month

Includes:

- SMS recovery

- automation features

---

## 13. Product Roadmap

Phase 1

Declined payment recovery

---

Phase 2

SMS recovery messaging

---

Phase 3

Decline analytics dashboard

---

Phase 4

AI retry optimization

---

## Final Summary

The refined product solves a **very specific problem**:

Customers leave after a declined payment.

The app:

1. Detects the failed payment event

2. Contacts the customer

3. Returns them to checkout

4. Recovers the sale

Positioning stays simple:

> Recover lost sales from declined payments.

## MVP implementation spec

Here’s a concrete MVP implementation spec for the **Declined Payment Recovery** app, built around Shopify’s actual webhook/API surface and Shopify’s webhook delivery constraints. The core design assumption is: you will detect a mix of **confirmed payment failures** and **likely late-stage checkout abandonments**, because Shopify exposes strong signals for transactions and abandoned checkouts, but not a single perfect webhook for “customer just saw a card decline on one-time checkout.”

### 1. MVP scope

The MVP should do four things only:

1. ingest Shopify events safely,

2. classify each case as confirmed failure vs likely late-stage abandonment,

3. suppress recovery when the shopper successfully completes checkout on their own,

4. send one or more recovery messages with a Shopify recovery link. Shopify’s `abandonedCheckouts` query includes abandoned and recovered checkouts plus a recovery URL, and Shopify recommends webhook architectures that acknowledge quickly and process asynchronously.

Do **not** try to process payments, alter gateway logic, or parse raw gateway receipt blobs for business logic. Shopify’s `OrderTransaction` object already provides typed fields such as `status`, `errorCode`, `gateway`, and `paymentDetails`, and Shopify explicitly warns that `receiptJson` is gateway-specific and not a stable contract.

### 2. Shopify subscriptions for MVP

Subscribe to these webhook topics:

- `checkouts/create`

- `checkouts/update`

- `order_transactions/create`

- `orders/create`

- `orders/paid`

- `orders/cancelled`

These topics are all in Shopify’s webhook topic reference. In particular, `order_transactions/create` fires when an order transaction is created or its status is updated, and only for statuses `success`, `failure`, or `error`. `orders/paid` and `orders/create` are your main suppression signals. `orders/cancelled` is a safety signal so you don’t keep recovering an invalid or cancelled path.

For a later subscription-specific module, also subscribe to `subscription_billing_attempts/failure` and `subscription_billing_attempts/success`, since Shopify does expose explicit recurring billing failure/success webhooks there.

### 3. Required app scopes

For MVP, plan on at least:

- `read_orders`

- the abandoned checkout permission needed for `abandonedCheckouts` / `abandonedCheckoutsCount`

Shopify documents that `abandonedCheckoutsCount` requires `read_orders` plus `manage_abandoned_checkouts`, and `abandonedCheckouts` returns recovery URLs and checkout/customer details used for re-engagement.

### 4. Webhook receiver contract

Your webhook endpoint must:

- verify `X-Shopify-Hmac-SHA256`,

- read the raw request body before JSON parsing,

- persist the event immediately,

- return 200 quickly,

- process asynchronously from a queue.

Shopify recommends responding within five seconds, recommends queueing when you can’t finish that fast, retries failed deliveries 8 times over 4 hours, and says the webhook should be HMAC-validated using the app secret and raw body. Shopify also notes that duplicate deliveries can happen and that apps should process webhooks idempotently.

Headers you should persist from every webhook:

- `X-Shopify-Topic`

- `X-Shopify-Shop-Domain`

- `X-Shopify-API-Version`

- `X-Shopify-Webhook-Id`

- `X-Shopify-Event-Id`

- `X-Shopify-Triggered-At`

Shopify documents these webhook headers, and specifically recommends using `X-Shopify-Event-Id` to detect duplicate deliveries of the same event.

### 5. Database schema for MVP

Use a simple relational model.

shops

One row per installed merchant.

Fields:

- `id`

- `shop_domain` unique

- `access_token_encrypted`

- `api_version`

- `is_active`

- `installed_at`

- `uninstalled_at`

- `default_timezone`

- `settings_json`

This is standard app tenancy and lets you query Shopify GraphQL per store. Shopify’s current guidance is to build new public apps with GraphQL Admin API rather than relying on REST.

webhook_events

Raw event ledger for auditing and idempotency.

Fields:

- `id`

- `shop_id`

- `topic`

- `event_id`

- `webhook_id`

- `triggered_at`

- `api_version`

- `hmac_valid`

- `payload_json`

- `received_at`

- `processed_at`

- `processing_status` (`queued`, `processed`, `skipped_duplicate`, `failed`)

- unique index on (`shop_id`, `event_id`, `topic`)

Use `event_id` as the main duplicate key because Shopify says the same `X-Shopify-Event-Id` across more than one webhook indicates a duplicate of the same event.

checkouts

Your normalized view of a checkout candidate.

Fields:

- `id`

- `shop_id`

- `shopify_checkout_id` nullable until resolved

- `checkout_token` nullable

- `email`

- `phone`

- `customer_id` nullable

- `currency`

- `subtotal_amount`

- `total_amount`

- `line_items_hash`

- `started_at`

- `last_seen_at`

- `completed_at` nullable

- `abandoned_at` nullable

- `recovery_url`

- `recovered_at` nullable

- `checkout_status` (`active`, `abandoned`, `recovered`, `expired`, `unknown`)

The recovery URL and recovered status come from `abandonedCheckouts`; Shopify explicitly includes both abandoned and recovered checkouts in that query.

payment_signals

Normalized payment-related evidence attached either to a checkout or order.

Fields:

- `id`

- `shop_id`

- `checkout_id` nullable

- `shopify_order_gid` nullable

- `shopify_transaction_gid` nullable

- `signal_type` (`transaction_failure`, `transaction_error`, `transaction_success`, `order_created`, `order_paid`, `order_cancelled`, `likely_late_stage_abandonment`)

- `gateway`

- `transaction_kind`

- `transaction_status`

- `error_code`

- `payment_method_summary`

- `amount`

- `currency`

- `occurred_at`

- `raw_source_topic`

- `raw_source_event_id`

This schema matches Shopify’s typed transaction fields like `kind`, `status`, `errorCode`, `gateway`, and `paymentDetails`.

recovery_cases

One row per recovery opportunity.

Fields:

- `id`

- `shop_id`

- `checkout_id` nullable

- `shopify_order_gid` nullable

- `case_type` (`confirmed_decline`, `likely_payment_stage_abandonment`)

- `case_status` (`candidate`, `suppressed`, `ready`, `messaging`, `recovered`, `expired`, `cancelled`)

- `confidence_score` integer 0–100

- `opened_at`

- `suppression_until`

- `ready_at`

- `closed_at`

- `close_reason` nullable

- `primary_reason_code` nullable

- `notes_json`

This lets you keep your analytics honest by separating **confirmed** failures from **likely** ones. That distinction follows directly from Shopify’s event surface.

recovery_messages

Tracks every outbound attempt.

Fields:

- `id`

- `recovery_case_id`

- `channel` (`email`, later `sms`)

- `sequence_step` integer

- `template_version`

- `scheduled_for`

- `sent_at` nullable

- `delivery_status`

- `opened_at` nullable

- `clicked_at` nullable

- `checkout_completed_after_click_at` nullable

- `provider_message_id` nullable

orders_index

Fast suppression and attribution lookup.

Fields:

- `id`

- `shop_id`

- `shopify_order_gid` unique

- `order_name`

- `email`

- `customer_id` nullable

- `financial_status`

- `gateway_names_json`

- `created_at`

- `paid_at` nullable

- `cancelled_at` nullable

- `checkout_recovery_attributed_case_id` nullable

### 6. Ingestion flow

When a webhook arrives:

1. verify HMAC,

2. extract headers,

3. compute dedupe key,

4. insert into `webhook_events`,

5. if duplicate, mark `skipped_duplicate`,

6. if new, enqueue a background job and return 200.

This follows Shopify’s HTTPS webhook guidance: verify origin with HMAC, use raw body, queue processing, and design for retries and duplicates.

### 7. Per-topic payload handling

A. `checkouts/create`

Purpose: create or upsert an in-progress checkout candidate.

Handling:

- extract checkout identifier and contact info if present,

- create/update `checkouts`,

- set `started_at` and `last_seen_at`,

- do **not** open a recovery case yet.

Why: a checkout being created is normal funnel activity, not evidence of failure. Shopify positions webhooks as event triggers and `abandonedCheckouts` as the source for later abandoned/recovered resolution.

B. `checkouts/update`

Purpose: refresh the checkout candidate and capture late-stage activity.

Handling:

- update `last_seen_at`,

- refresh email / phone / total / line items,

- if you can infer late-funnel progression from payload changes, store those heuristics,

- enqueue a delayed reconciliation job for this checkout 15–30 minutes later.

This delayed reconciliation is important because Shopify explicitly recommends building a reconciliation job if you can’t afford to miss webhook-derived states.

C. `order_transactions/create`

Purpose: strongest confirmed payment signal.

Handling:

- parse transaction status,

- if `status in [FAILURE, ERROR]`, insert `payment_signals` row,

- if `status = SUCCESS`, insert success signal,

- fetch the associated order with GraphQL if needed and store normalized fields:

    - `status`

    - `kind`

    - `errorCode`

    - `gateway`

    - `paymentDetails`

    - `processedAt`

This topic is explicitly documented by Shopify as being emitted only for `success`, `failure`, or `error` transaction statuses, and the `OrderTransaction` object exposes the typed diagnostic fields you want.

D. `orders/create`

Purpose: suppress false positives and build attribution.

Handling:

- upsert into `orders_index`,

- attach to any recent open `recovery_cases` by email/customer/cart similarity,

- mark matching cases `suppressed` or `recovered` depending on whether a message was already sent.

E. `orders/paid`

Purpose: hard suppression signal.

Handling:

- mark matching `recovery_cases` as `recovered` if a recovery message preceded payment,

- otherwise mark as `suppressed_manual_retry`,

- stop any scheduled unsent messages.

`orders/paid` is your cleanest “customer succeeded” event for standard checkout.

F. `orders/cancelled`

Purpose: avoid bad recovery experiences.

Handling:

- mark related cases `cancelled`,

- stop future messaging unless the merchant explicitly enables a cancelled-order recovery mode.

### 8. Reconciliation jobs

You need two periodic jobs.

Job 1: abandoned checkout reconciliation

Run every 10–15 minutes per active shop.

Query `abandonedCheckouts` for recently updated checkouts and fetch:

- `id`

- `createdAt`

- `updatedAt`

- `completedAt`

- recovery URL

- customer/contact info

- price basics

Shopify says `abandonedCheckouts` includes both abandoned and recovered checkouts and provides a recovery URL. This is the bridge between raw checkout activity and a recoverable state.

Logic:

- if a tracked checkout now appears in `abandonedCheckouts` with no matching paid order, mark `checkouts.abandoned_at`,

- store/update `recovery_url`,

- if later shown as recovered or if a matching order exists, mark `recovered_at` and suppress.

Job 2: orphan transaction/order reconciliation

Run every 30–60 minutes.

Purpose:

- fill gaps from missed or delayed webhooks,

- refresh recent orders/transactions for open cases,

- close stale cases.

Shopify explicitly recommends a reconciliation job if you can’t afford to miss webhooks.

### 9. Classification rules

Use a simple scoring model in MVP.

Confirmed decline

Open a `recovery_case` with `case_type = confirmed_decline` when:

- `order_transactions/create` arrives with `FAILURE` or `ERROR`,

- no `orders/paid` has arrived for the same order,

- no later successful transaction has superseded it,

- customer/contact path is available for recovery.

This is the highest-confidence bucket because it’s grounded in Shopify’s explicit transaction status model.

Likely payment-stage abandonment

Open a `recovery_case` with `case_type = likely_payment_stage_abandonment` when:

- checkout was seen in `checkouts/create` or `checkouts/update`,

- later appears in `abandonedCheckouts`,

- no matching order was created/paid,

- your heuristics suggest a late-funnel drop.

Useful heuristics:

- customer contact info present,

- shipping info likely present,

- abandonment occurred shortly after a checkout update burst,

- store has a configured online card gateway,

- total > 0 and not draft/invoice edge cases.

This bucket is inherently inferential because Shopify’s `abandonedCheckouts` query tells you abandonment and recovery, not the precise abandonment reason.

### 10. Suppression rules

These matter a lot more than the messaging itself.

Suppression window after confirmed failure

If a confirmed failure signal arrives, wait 10–20 minutes before sending anything.

Reason: Shopify checkout already tells the customer immediately that payment failed, so many shoppers will retry on their own right away. Your app should only engage **after** that first self-recovery window. The immediate in-checkout failure handling is Shopify’s native behavior; your product is about the post-failure dropout. This is an inference from Shopify’s standard checkout/payment flow plus the transaction events you receive. Supported recovery should be delayed and event-suppressed by `orders/create` / `orders/paid`.

Global suppression conditions

Never send if:

- matching order is paid,

- matching order was created and merchant prefers no duplicate nudges,

- order is cancelled,

- checkout is already marked recovered,

- no customer contact info,

- the case is older than your recovery TTL, such as 72 hours.

Duplicate suppression

Do not reopen a new case if:

- same shop + same checkout + same abandonment window already has an open case,

- same order already has a confirmed decline case within the last 24 hours.

Messaging suppression

Stop all queued messages when:

- `orders/paid` arrives,

- checkout becomes recovered,

- merchant disables the workflow,

- shopper unsubscribes from marketing-like outreach where applicable.

### 11. Event-state machine

Use this exact state machine for `recovery_cases`.

States

- `candidate`

- `suppressed`

- `ready`

- `messaging`

- `recovered`

- `expired`

- `cancelled`

Transitions

`candidate -> suppressed`\
when a success signal arrives during the suppression window:

- `orders/create`

- `orders/paid`

- successful transaction

- recovered checkout

`candidate -> ready`\
when suppression window passes and no success/cancel conditions exist.

`ready -> messaging`\
when first recovery message is sent.

`messaging -> recovered`\
when `orders/paid`, matching `orders/create` plus paid state, or recovered checkout is observed after message send.

`messaging -> suppressed`\
if customer self-recovers before next scheduled message.

`candidate|ready|messaging -> cancelled`\
when `orders/cancelled` arrives or merchant manually closes the case.

`candidate|ready|messaging -> expired`\
when case TTL is exceeded with no recovery.

This is intentionally simple and robust against webhook reorder, retries, and partial visibility. Shopify warns that duplicates can occur and recommends asynchronous, idempotent processing; this state machine is built for that.

### 12. Matching and attribution rules

For MVP, use deterministic matching in this order:

1. exact Shopify order/transaction linkage,

2. checkout ID / token linkage,

3. same shop + normalized email + similar total + time proximity,

4. same shop + customer ID + time proximity.

Attribution rule:

- if a message was clicked and a matching order is paid within 7 days, mark recovered,

- otherwise if a case was open and paid occurs within 24 hours without click, mark assisted/suppressed rather than recovered.

This keeps ROI reporting conservative.

### 13. GraphQL queries to implement

Query A: abandoned checkouts

Use it during reconciliation to fetch recently updated abandoned/recovered checkouts and the recovery URL. Shopify explicitly documents this query for abandoned and recovered checkouts and includes the recovery URL.

Query B: order with transactions

For a specific order:

- `id`

- `displayFinancialStatus`

- `transactions { id kind status errorCode gateway paymentDetails processedAt }`

Those transaction fields are all on the `OrderTransaction` object and are the correct typed fields to use.

### 14. Messaging logic for MVP

Sequence:

- message 1 at T+15 minutes,

- message 2 at T+12 hours,

- message 3 at T+36 hours.

Copy should be honest and not claim certainty unless the case is confirmed.

For `confirmed_decline`:\
“Your payment didn’t go through, but your checkout is still available.”

For `likely_payment_stage_abandonment`:\
“Looks like your checkout wasn’t completed. Your items are still available.”

That wording matters because your second bucket is inferential, not explicit.

### 15. Risk controls

Do not:

- mention specific decline reasons unless sourced from typed, merchant-appropriate fields and legally safe to expose,

- promise that the card was declined if the case is only a likely abandonment,

- parse `receiptJson`,

- send immediately on the first failure signal,

- send if there is no valid recovery URL or no verified path back to checkout.

Shopify explicitly warns against treating `receiptJson` as a stable contract, and its recovery model for abandoned checkouts is centered around the recovery URL.

### 16. Technical stack recommendation

For MVP, I’d use:

- Shopify app scaffold with GraphQL Admin API,

- PostgreSQL,

- Redis or durable job queue,

- worker process for reconciliation and messaging,

- webhook HTTPS endpoint with raw-body HMAC verification.

This aligns with Shopify’s current direction: GraphQL Admin API for new public apps, webhook HMAC validation, queue-backed processing, and reconciliation for missed events.

### 17. Honest viability note

The weak point is still standard one-time checkout precision. You can build a solid app, but the analytics and UI should always separate:

- **Confirmed payment failures**

- **Likely payment-stage abandonments**

That is the cleanest product truth given Shopify’s current webhook and GraphQL surface.

The next best step is to turn this into a **developer-facing engineering spec** with:

- concrete GraphQL queries,

- sample webhook payload shapes,

- SQL schema,

- queue jobs,

- and pseudocode for each state transition.

---

- Also - we need to integrate the subscription integration (with a website)

### proceed to map out : The exact Shopify webhooks and APIs needed to detect declined payments reliably

Yes. And the key conclusion is:

**You probably cannot detect “customer saw a card decline at checkout” with 100% precision for standard one-time Shopify checkout using a single dedicated webhook, because Shopify does not expose a standard decline-specific webhook topic for normal online checkout in the public webhook list.** What Shopify _does_ expose is a set of adjacent signals you can combine: `checkouts/create`, `checkouts/update`, `order_transactions/create`, `orders/create`, `orders/updated`, `orders/cancelled`, and the `abandonedCheckouts` GraphQL query. For subscriptions, there _is_ a dedicated `subscription_billing_attempts/failure` webhook.

### The exact Shopify pieces to use

1) Webhooks to subscribe to

Use these as your primary event sources:

- `checkouts/create`

- `checkouts/update`

- `checkouts/delete`

- `order_transactions/create`

- `orders/create`

- `orders/updated`

- `orders/cancelled`

All of those topics are present in Shopify’s current webhook topic list, and `order_transactions/create` is specifically documented as firing when an order transaction is created or its status changes, but only for transactions whose status is `success`, `failure`, or `error`.

For subscription merchants, also subscribe to:

- `subscription_billing_attempts/failure`

- `subscription_billing_attempts/success`

Those are explicit payment-failure signals, but they apply to subscription billing attempts, not normal one-time storefront checkout.

2) GraphQL Admin API queries you’ll need

Use these Admin GraphQL resources:

- `abandonedCheckouts`

- `abandonedCheckoutsCount`

- `order(id: …)`

- order transaction fields on `Order`

Shopify’s `abandonedCheckouts` query returns abandoned and recovered checkouts and includes a recovery URL. Shopify also documents that a checkout is considered abandoned when the customer adds contact information but does not complete the purchase. `abandonedCheckoutsCount` requires `read_orders` plus the `manage_abandoned_checkouts` permission.

For orders, Shopify’s `OrderTransaction` object exposes the fields you care about for diagnostics: `status`, `kind`, `errorCode`, `gateway`, `paymentDetails`, and `processedAt`. Shopify explicitly says apps should not rely on `receiptJson` for business logic because it is gateway-specific and not a stable contract.

3) Platform-level constraints to design around

For new public apps, Shopify says the REST Admin API is legacy and new public apps must use the GraphQL Admin API. Also, the old REST Checkout API is deprecated. That pushes you toward a **GraphQL Admin + webhooks** architecture, not a Checkout-API-centric one.

---

### What is actually “reliable” vs “not reliable”

Reliable signals

**A. Order transaction failure, when an order transaction exists**\
`order_transactions/create` is your strongest payment-failure webhook because Shopify says it fires for transaction statuses including `failure` and `error`. If a transaction object exists, this is your cleanest machine-readable failure signal.

**B. Abandoned checkout existence + recovery state**\
`abandonedCheckouts` is reliable for telling you that a checkout was abandoned and whether it was later recovered. It also gives you the recovery URL you need for re-engagement.

**C. Order creation / payment success suppression**\
`orders/create` and `orders/paid` are reliable negative signals: if an order gets created and paid, you suppress recovery.

Not fully reliable

**“Customer just saw an on-screen card decline in checkout”** is the hard one. Shopify exposes checkout and order topics, but there is no standard public webhook topic in the current list that is simply “payment declined during one-time online checkout.” So for standard checkout, you’ll usually be inferring this state from a combination of signals rather than receiving one perfect event.

That means the app should be positioned internally as:

**“declined-payment / payment-failure abandonment recovery”**

not

**“real-time payment decline detector with perfect accuracy.”**

---

### Recommended detection architecture

### Tier 1: Best-case detection path

Use this when Shopify gives you an order transaction failure.

**Flow**

1. Receive `order_transactions/create`

2. Check transaction `status`

3. If `status in [FAILURE, ERROR]`, mark as a payment-failure candidate

4. Pull the order via GraphQL and inspect:

    - transaction `kind`

    - transaction `errorCode`

    - `gateway`

    - customer/contactability

5. Wait a short suppression window

6. If no successful completion signal arrives, enqueue recovery

This is the cleanest path because Shopify explicitly documents transaction status and error fields.

### Tier 2: Checkout-abandonment inference path

Use this for the much larger set of checkouts where you may not get an explicit transaction failure event.

**Flow**

1. Receive `checkouts/create` / `checkouts/update`

2. Persist checkout identity and timestamps

3. After a delay, query `abandonedCheckouts` for matching abandoned checkouts

4. If the checkout is in abandoned state and not recovered, treat it as a recovery candidate

5. Optionally use heuristics to score it as “likely payment-stage abandonment” rather than generic abandonment

This works because Shopify exposes abandoned checkouts and recovery state, even though it does not publicly expose a standard one-time “declined payment” webhook topic.

### Tier 3: Subscription-specific path

For subscription merchants, use:

- `subscription_billing_attempts/failure`

- `subscription_billing_attempts/success`

That is the one area where Shopify gives you an explicit failure webhook.

---

### The exact webhook set I would implement for MVP

I would start with this set:

- `checkouts/create`

- `checkouts/update`

- `order_transactions/create`

- `orders/create`

- `orders/paid`

- `orders/cancelled`

Why this set:

- `checkouts/*` gives you the candidate funnel

- `order_transactions/create` gives explicit `failure` / `error` when available

- `orders/create` and `orders/paid` tell you the customer succeeded

- `orders/cancelled` helps catch failed or voided order paths that should not continue through recovery blindly

I would add `orders/updated` only if you later confirm you need it for certain gateways or merchant setups. It is broad and can create noise. Shopify documents it simply as firing whenever an order is updated.

---

### The exact GraphQL reads I would implement

A. Query abandoned checkouts

Use `abandonedCheckouts` to fetch:

- `id`

- `createdAt`

- `updatedAt`

- `completedAt`

- `abandonedCheckoutUrl`

- customer basics

- pricing basics

Those fields are shown in Shopify’s example query for abandoned checkouts.

B. Query order + transactions

When you have an order ID, fetch:

- order `id`

- `displayFinancialStatus`

- `transactions { id status kind errorCode gateway processedAt paymentDetails }`

The `OrderTransaction` object is where Shopify exposes typed status/error info for payment-related events.

C. Count / segment abandoned checkouts

Use `abandonedCheckoutsCount` for merchant-facing analytics and onboarding benchmarks. It requires `read_orders` and `manage_abandoned_checkouts`.

---

### The practical detection logic I would ship

Rule 1

If `order_transactions/create` arrives with `status = FAILURE or ERROR`:

- classify as **explicit payment failure**

- suppress recovery for 10–20 minutes in case the customer immediately retries

- if no paid order materializes, send recovery

That part is grounded directly in Shopify’s transaction webhook behavior.

Rule 2

If a checkout appears in `abandonedCheckouts` and no success event has arrived:

- classify as **abandoned checkout**

- if your heuristics suggest late-funnel abandonment, classify as **likely payment-stage abandonment**

- send softer recovery copy first

This is because `abandonedCheckouts` tells you abandonment and recovery, but not necessarily the precise reason for abandonment.

Rule 3

If subscription failure webhook arrives:

- classify as **confirmed recurring payment failure**

- recover with a subscription-specific flow

That one is explicit.

---

### Important product implication

This means your app should probably have **two internal buckets**:

1. **Confirmed payment failures**\
    explicit transaction failure or subscription billing failure

2. **Likely payment-stage abandonments**\
    abandoned checkouts that appear to have dropped late in checkout but do not have a clean failure event

That distinction keeps your analytics honest and protects you from overclaiming accuracy. It also gives you cleaner merchant messaging. Shopify’s public API surface supports the first bucket well in some cases, and the second bucket indirectly via abandoned checkout data.

---

### My blunt technical verdict

**Technically viable:** yes.\
**Perfectly reliable “declined payment detection” for standard one-time checkout:** no.\
**Viable product if framed as recovery for confirmed + likely payment-failure abandonments:** yes.

So the MVP should not promise:

> “We know every time a card is declined.”

It should promise:

> “We recover customers who drop out after payment problems or late-stage checkout failure.”

That is much more defensible given Shopify’s current webhook and Admin API surface.

Next, I can turn this into a concrete MVP implementation spec with the actual webhook payload handling, suppression rules, database tables, and event-state machine.

**Maybe I'm missing something basic - what currently takes place when a 'failed payment is detected'? Doesn't Shopify already have this functionality? I'm picturing a customer entering their credit card info into the cart field and initiating the purchase. They would be informed instantly if the payment didn't work, correct??? What am I missing?**

Brian — this is an **excellent question**, and it gets to the heart of whether the idea is viable. You’re not missing anything; you’re actually identifying the **exact limitation you need to design around**.

Short answer:

**Yes — Shopify already handles the _immediate_ payment failure at checkout.**\
But the opportunity exists in what happens **after the customer leaves the checkout.**

Let’s walk through the real flow.

---

## 1. What Actually Happens When a Payment Fails in Shopify

Typical checkout flow:

1. Customer enters credit card

2. Shopify sends authorization request to gateway

3. Bank declines the payment

4. Checkout displays an error message

Example messages:

- “Your card was declined.”

- “Payment could not be processed.”

- “Try another payment method.”

The customer **is notified instantly.**

You are correct about that.

---

## 2. The Critical Problem

Most customers **do not attempt another payment**.

Instead they:

- abandon the checkout

- close the tab

- leave the site

From the merchant's perspective:

**The sale is gone.**

---

## 3. Shopify’s Default Recovery Behavior

Shopify does **very little specifically for failed payments**.

The only built-in tool is:

**abandoned checkout emails**

Shopify sends one email if:

- checkout started

- email entered

- order not completed

But this email is generic.

Example:

> “You left something in your cart.”

It is **not tailored to payment failure**.

---

## 4. What Shopify Does NOT Do

Shopify does not:

❌ detect why the payment failed\
❌ retry payment automatically\
❌ send payment-specific recovery messages\
❌ suggest alternate payment methods\
❌ analyze decline patterns

This is the gap.

---

## 5. The Real Opportunity

The opportunity is **post-failure recovery**.

Timeline example:

Time 0

Customer attempts payment\
Card declined

Checkout shows error.

Customer leaves.

---

Time +10 minutes

Your app sends:

> "Your payment didn’t go through, but your items are still reserved."

With a checkout link.

---

Time +4 hours

Second recovery message.

Suggests:

> "Try PayPal or Shop Pay for faster checkout."

---

Time +24 hours

Final recovery message.

---

## 6. Why This Works

Many declines are **temporary**.

Examples:

- fraud checks

- daily spending limits

- insufficient funds

- network issues

Customers often succeed on the **second attempt**.

Large ecommerce platforms report **10–20% recovery** on failed payments.

---

## 7. The Subtle But Important Difference

Your app is not solving:

**"Payment failed."**

Shopify already handles that.

Your app solves:

**"Customer left after payment failed."**

That’s the real problem.

---

## 8. A Real Example Scenario

Customer behavior:

1. Customer buys $120 item

2. Card declined due to fraud detection

3. Customer confused

4. Customer leaves

Later:

1. Customer gets email

2. Clicks recovery link

3. Uses PayPal

4. Purchase completed

Without recovery messaging:

**Sale lost forever.**

---

## 9. Why Merchants Care

For many stores:

Checkout abandonment rates are:

**60–80%**

Payment declines contribute significantly.

Even recovering **1–3% of those sales** is meaningful.

---

## 10. The Real Product Positioning

Your app is not:

**Payment recovery**

It’s more accurately:

**Declined payment recovery**

or

**Payment failure conversion recovery**

Better marketing.

---

## 11. The One Technical Challenge

The key difficulty is **detecting failed payments** reliably.

Shopify doesn’t expose this perfectly.

You may need to infer failure from:

- checkout abandonment after payment attempt

- order cancellation

- payment status events

This is solvable but requires careful logic.

---

## 12. Honest Reality Check

Here’s the honest part:

Some merchants will say:

> “Shopify already sends abandoned cart emails.”

Your response must be:

**Yes — but we recover failed payments specifically.**

Different problem.

---

## 13. A Stronger Product Concept

The app could become:

**Declined Payment Recovery for Shopify**

Features:

- detect payment declines

- targeted recovery messages

- alternative payment suggestions

- recovery analytics

That’s clearer.

---

## Final Insight

You identified the **most important design constraint early**, which is very good.

The product succeeds only if it focuses on:

**customers who abandon checkout after a payment failure.**

Not the failure itself.

---