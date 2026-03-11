import { PrismaClient } from "@prisma/client";
import { encrypt } from "../app/lib/encryption.server";

const prisma = new PrismaClient();

function hoursAgo(hours: number): Date {
  return new Date(Date.now() - hours * 60 * 60 * 1000);
}

function daysAgo(days: number): Date {
  return hoursAgo(days * 24);
}

function hoursFromNow(hours: number): Date {
  return new Date(Date.now() + hours * 60 * 60 * 1000);
}

async function main() {
  console.log("🌱 Seeding database...");

  // Clean existing data and reset autoincrement sequences
  await prisma.$executeRawUnsafe(`
    TRUNCATE TABLE "RecoveryMessage", "OrdersIndex", "RecoveryCase",
      "PaymentSignal", "Checkout", "WebhookEvent", "Shop"
    RESTART IDENTITY CASCADE
  `);

  console.log("  Cleared existing data.");

  // ── Shops ─────────────────────────────────────────────────────────────────
  const shop1 = await prisma.shop.create({
    data: {
      shopDomain: "cool-sneakers.myshopify.com",
      accessTokenEncrypted: encrypt("shpat_fake_token_001"),
      apiVersion: "2024-10",
      isActive: true,
      installedAt: daysAgo(30),
      defaultTimezone: "America/New_York",
      settingsJson: {
        recoveryEnabled: true,
        retryDelayMinutes: 30,
        maxRetries: 3,
        emailTemplateDecline:
          "Hi {{customer_name}}, it looks like your payment didn't go through for your {{shop_name}} order. Please try again: {{recovery_url}}",
        emailTemplateAbandonment:
          "Hi {{customer_name}}, you left some items in your cart at {{shop_name}}. Complete your purchase: {{recovery_url}}",
      },
    },
  });

  const shop2 = await prisma.shop.create({
    data: {
      shopDomain: "organic-teas.myshopify.com",
      accessTokenEncrypted: encrypt("shpat_fake_token_002"),
      apiVersion: "2024-10",
      isActive: true,
      installedAt: daysAgo(14),
      defaultTimezone: "America/Los_Angeles",
      settingsJson: {
        recoveryEnabled: true,
        retryDelayMinutes: 60,
        maxRetries: 2,
        emailTemplateDecline: "",
        emailTemplateAbandonment: "",
      },
    },
  });

  console.log("  Created 2 shops.");

  // ── Webhook Events ────────────────────────────────────────────────────────
  const webhookEvents = await Promise.all([
    prisma.webhookEvent.create({
      data: {
        shopId: shop1.id,
        topic: "orders/create",
        eventId: "evt_order_001",
        webhookId: "wh_001",
        triggeredAt: hoursAgo(6),
        apiVersion: "2024-10",
        hmacValid: true,
        payloadJson: { order_id: "gid://shopify/Order/100001", email: "alice@example.com" },
        processedAt: hoursAgo(6),
        processingStatus: "PROCESSED",
      },
    }),
    prisma.webhookEvent.create({
      data: {
        shopId: shop1.id,
        topic: "orders/paid",
        eventId: "evt_paid_001",
        webhookId: "wh_002",
        triggeredAt: hoursAgo(5),
        apiVersion: "2024-10",
        hmacValid: true,
        payloadJson: { order_id: "gid://shopify/Order/100001" },
        processedAt: hoursAgo(5),
        processingStatus: "PROCESSED",
      },
    }),
    prisma.webhookEvent.create({
      data: {
        shopId: shop1.id,
        topic: "checkouts/create",
        eventId: "evt_checkout_002",
        webhookId: "wh_003",
        triggeredAt: hoursAgo(3),
        apiVersion: "2024-10",
        hmacValid: true,
        payloadJson: { checkout_token: "ck_declined_001", email: "bob@example.com" },
        processedAt: hoursAgo(3),
        processingStatus: "PROCESSED",
      },
    }),
    prisma.webhookEvent.create({
      data: {
        shopId: shop1.id,
        topic: "orders/create",
        eventId: "evt_order_003",
        webhookId: "wh_004",
        triggeredAt: hoursAgo(1),
        apiVersion: "2024-10",
        hmacValid: true,
        payloadJson: { checkout_token: "ck_new_001", email: "carol@example.com" },
        processingStatus: "QUEUED",
      },
    }),
    prisma.webhookEvent.create({
      data: {
        shopId: shop2.id,
        topic: "checkouts/create",
        eventId: "evt_checkout_tea_001",
        webhookId: "wh_005",
        triggeredAt: hoursAgo(8),
        apiVersion: "2024-10",
        hmacValid: true,
        payloadJson: { checkout_token: "ck_tea_001", email: "david@example.com" },
        processedAt: hoursAgo(8),
        processingStatus: "PROCESSED",
      },
    }),
    prisma.webhookEvent.create({
      data: {
        shopId: shop2.id,
        topic: "orders/cancelled",
        eventId: "evt_cancel_tea_001",
        webhookId: "wh_006",
        triggeredAt: hoursAgo(2),
        apiVersion: "2024-10",
        hmacValid: false,
        payloadJson: { order_id: "gid://shopify/Order/200001" },
        processingStatus: "FAILED",
      },
    }),
  ]);

  console.log(`  Created ${webhookEvents.length} webhook events.`);

  // ── Checkouts (Shop 1) ────────────────────────────────────────────────────
  const checkout1 = await prisma.checkout.create({
    data: {
      shopId: shop1.id,
      shopifyCheckoutId: "gid://shopify/Checkout/100001",
      checkoutToken: "ck_completed_001",
      email: "alice@example.com",
      customerId: "gid://shopify/Customer/500001",
      currency: "USD",
      subtotalAmount: 89.99,
      totalAmount: 96.38,
      lineItemsHash: "a1b2c3d4",
      startedAt: hoursAgo(7),
      lastSeenAt: hoursAgo(6),
      completedAt: hoursAgo(6),
      recoveryUrl: "https://cool-sneakers.myshopify.com/checkouts/ck_completed_001/recover",
      recoveredAt: null,
      checkoutStatus: "RECOVERED",
    },
  });

  const checkout2 = await prisma.checkout.create({
    data: {
      shopId: shop1.id,
      shopifyCheckoutId: "gid://shopify/Checkout/100002",
      checkoutToken: "ck_declined_001",
      email: "bob@example.com",
      phone: "+15551234567",
      customerId: "gid://shopify/Customer/500002",
      currency: "USD",
      subtotalAmount: 249.95,
      totalAmount: 267.44,
      lineItemsHash: "e5f6g7h8",
      startedAt: hoursAgo(4),
      lastSeenAt: hoursAgo(3),
      recoveryUrl: "https://cool-sneakers.myshopify.com/checkouts/ck_declined_001/recover",
      checkoutStatus: "ABANDONED",
      abandonedAt: hoursAgo(2),
    },
  });

  const checkout3 = await prisma.checkout.create({
    data: {
      shopId: shop1.id,
      shopifyCheckoutId: "gid://shopify/Checkout/100003",
      checkoutToken: "ck_active_001",
      email: "carol@example.com",
      customerId: "gid://shopify/Customer/500003",
      currency: "USD",
      subtotalAmount: 34.99,
      totalAmount: 37.79,
      lineItemsHash: "i9j0k1l2",
      startedAt: hoursAgo(1),
      lastSeenAt: hoursAgo(1),
      recoveryUrl: "https://cool-sneakers.myshopify.com/checkouts/ck_active_001/recover",
      checkoutStatus: "ACTIVE",
    },
  });

  // New checkouts for shop1 — RECOVERED cases
  const ckJake = await prisma.checkout.create({
    data: {
      shopId: shop1.id,
      shopifyCheckoutId: "gid://shopify/Checkout/100010",
      checkoutToken: "ck_jake_001",
      email: "jake@example.com",
      phone: "+15559001001",
      customerId: "gid://shopify/Customer/500010",
      currency: "USD",
      subtotalAmount: 175.00,
      totalAmount: 189.00,
      lineItemsHash: "jk01aa11",
      startedAt: daysAgo(5),
      lastSeenAt: daysAgo(5),
      completedAt: daysAgo(4),
      recoveryUrl: "https://cool-sneakers.myshopify.com/checkouts/ck_jake_001/recover",
      checkoutStatus: "RECOVERED",
    },
  });

  const ckMaria = await prisma.checkout.create({
    data: {
      shopId: shop1.id,
      shopifyCheckoutId: "gid://shopify/Checkout/100011",
      checkoutToken: "ck_maria_001",
      email: "maria@example.com",
      customerId: "gid://shopify/Customer/500011",
      currency: "USD",
      subtotalAmount: 62.00,
      totalAmount: 67.00,
      lineItemsHash: "mr02bb22",
      startedAt: daysAgo(4),
      lastSeenAt: daysAgo(4),
      completedAt: daysAgo(3),
      recoveryUrl: "https://cool-sneakers.myshopify.com/checkouts/ck_maria_001/recover",
      checkoutStatus: "RECOVERED",
    },
  });

  const ckTom = await prisma.checkout.create({
    data: {
      shopId: shop1.id,
      shopifyCheckoutId: "gid://shopify/Checkout/100012",
      checkoutToken: "ck_tom_001",
      email: "tom@example.com",
      phone: "+15559003003",
      customerId: "gid://shopify/Customer/500012",
      currency: "USD",
      subtotalAmount: 289.00,
      totalAmount: 312.00,
      lineItemsHash: "tm03cc33",
      startedAt: daysAgo(2),
      lastSeenAt: daysAgo(2),
      completedAt: daysAgo(1),
      recoveryUrl: "https://cool-sneakers.myshopify.com/checkouts/ck_tom_001/recover",
      checkoutStatus: "RECOVERED",
    },
  });

  // New checkouts for shop1 — MESSAGING cases
  const ckLisa = await prisma.checkout.create({
    data: {
      shopId: shop1.id,
      shopifyCheckoutId: "gid://shopify/Checkout/100013",
      checkoutToken: "ck_lisa_001",
      email: "lisa@example.com",
      customerId: "gid://shopify/Customer/500013",
      currency: "USD",
      subtotalAmount: 135.00,
      totalAmount: 145.00,
      lineItemsHash: "ls04dd44",
      startedAt: hoursAgo(14),
      lastSeenAt: hoursAgo(12),
      recoveryUrl: "https://cool-sneakers.myshopify.com/checkouts/ck_lisa_001/recover",
      checkoutStatus: "ABANDONED",
      abandonedAt: hoursAgo(11),
    },
  });

  const ckKevin = await prisma.checkout.create({
    data: {
      shopId: shop1.id,
      shopifyCheckoutId: "gid://shopify/Checkout/100014",
      checkoutToken: "ck_kevin_001",
      email: "kevin@example.com",
      phone: "+15559005005",
      customerId: "gid://shopify/Customer/500014",
      currency: "USD",
      subtotalAmount: 72.00,
      totalAmount: 78.00,
      lineItemsHash: "kv05ee55",
      startedAt: hoursAgo(10),
      lastSeenAt: hoursAgo(8),
      recoveryUrl: "https://cool-sneakers.myshopify.com/checkouts/ck_kevin_001/recover",
      checkoutStatus: "ABANDONED",
      abandonedAt: hoursAgo(7),
    },
  });

  const ckSarah = await prisma.checkout.create({
    data: {
      shopId: shop1.id,
      shopifyCheckoutId: "gid://shopify/Checkout/100015",
      checkoutToken: "ck_sarah_001",
      email: "sarah@example.com",
      customerId: "gid://shopify/Customer/500015",
      currency: "USD",
      subtotalAmount: 207.00,
      totalAmount: 223.00,
      lineItemsHash: "sr06ff66",
      startedAt: hoursAgo(8),
      lastSeenAt: hoursAgo(6),
      recoveryUrl: "https://cool-sneakers.myshopify.com/checkouts/ck_sarah_001/recover",
      checkoutStatus: "ABANDONED",
      abandonedAt: hoursAgo(5),
    },
  });

  // New checkouts for shop1 — EXPIRED cases
  const ckMike = await prisma.checkout.create({
    data: {
      shopId: shop1.id,
      shopifyCheckoutId: "gid://shopify/Checkout/100016",
      checkoutToken: "ck_mike_001",
      email: "mike@example.com",
      customerId: "gid://shopify/Customer/500016",
      currency: "USD",
      subtotalAmount: 51.00,
      totalAmount: 55.00,
      lineItemsHash: "mk07gg77",
      startedAt: daysAgo(7),
      lastSeenAt: daysAgo(6),
      abandonedAt: daysAgo(6),
      recoveryUrl: "https://cool-sneakers.myshopify.com/checkouts/ck_mike_001/recover",
      checkoutStatus: "EXPIRED",
    },
  });

  const ckRachel = await prisma.checkout.create({
    data: {
      shopId: shop1.id,
      shopifyCheckoutId: "gid://shopify/Checkout/100017",
      checkoutToken: "ck_rachel_001",
      email: "rachel@example.com",
      customerId: "gid://shopify/Customer/500017",
      currency: "USD",
      subtotalAmount: 85.00,
      totalAmount: 92.00,
      lineItemsHash: "rc08hh88",
      startedAt: daysAgo(6),
      lastSeenAt: daysAgo(5),
      abandonedAt: daysAgo(5),
      recoveryUrl: "https://cool-sneakers.myshopify.com/checkouts/ck_rachel_001/recover",
      checkoutStatus: "EXPIRED",
    },
  });

  const ckDan = await prisma.checkout.create({
    data: {
      shopId: shop1.id,
      shopifyCheckoutId: "gid://shopify/Checkout/100018",
      checkoutToken: "ck_dan_001",
      email: "dan@example.com",
      phone: "+15559009009",
      customerId: "gid://shopify/Customer/500018",
      currency: "USD",
      subtotalAmount: 38.00,
      totalAmount: 41.00,
      lineItemsHash: "dn09ii99",
      startedAt: daysAgo(5),
      lastSeenAt: daysAgo(4),
      abandonedAt: daysAgo(4),
      recoveryUrl: "https://cool-sneakers.myshopify.com/checkouts/ck_dan_001/recover",
      checkoutStatus: "EXPIRED",
    },
  });

  // New checkouts for shop1 — SUPPRESSED cases
  const ckNina = await prisma.checkout.create({
    data: {
      shopId: shop1.id,
      shopifyCheckoutId: "gid://shopify/Checkout/100019",
      checkoutToken: "ck_nina_001",
      email: "nina@example.com",
      customerId: "gid://shopify/Customer/500019",
      currency: "USD",
      subtotalAmount: 155.00,
      totalAmount: 167.00,
      lineItemsHash: "nn10jj00",
      startedAt: hoursAgo(12),
      lastSeenAt: hoursAgo(10),
      completedAt: hoursAgo(9),
      recoveryUrl: "https://cool-sneakers.myshopify.com/checkouts/ck_nina_001/recover",
      checkoutStatus: "RECOVERED",
    },
  });

  const ckChris = await prisma.checkout.create({
    data: {
      shopId: shop1.id,
      shopifyCheckoutId: "gid://shopify/Checkout/100020",
      checkoutToken: "ck_chris_001",
      email: "chris@example.com",
      customerId: "gid://shopify/Customer/500020",
      currency: "USD",
      subtotalAmount: 82.00,
      totalAmount: 88.00,
      lineItemsHash: "cr11kk11",
      startedAt: hoursAgo(6),
      lastSeenAt: hoursAgo(4),
      completedAt: hoursAgo(3),
      recoveryUrl: "https://cool-sneakers.myshopify.com/checkouts/ck_chris_001/recover",
      checkoutStatus: "RECOVERED",
    },
  });

  // New checkout for shop1 — CANCELLED case
  const ckPat = await prisma.checkout.create({
    data: {
      shopId: shop1.id,
      shopifyCheckoutId: "gid://shopify/Checkout/100021",
      checkoutToken: "ck_pat_001",
      email: "pat@example.com",
      customerId: "gid://shopify/Customer/500021",
      currency: "USD",
      subtotalAmount: 188.00,
      totalAmount: 203.00,
      lineItemsHash: "pt12ll22",
      startedAt: daysAgo(2),
      lastSeenAt: daysAgo(1),
      recoveryUrl: "https://cool-sneakers.myshopify.com/checkouts/ck_pat_001/recover",
      checkoutStatus: "ABANDONED",
      abandonedAt: daysAgo(1),
    },
  });

  // ── Checkouts (Shop 2) ────────────────────────────────────────────────────
  const checkout4 = await prisma.checkout.create({
    data: {
      shopId: shop2.id,
      shopifyCheckoutId: "gid://shopify/Checkout/200001",
      checkoutToken: "ck_tea_001",
      email: "david@example.com",
      customerId: "gid://shopify/Customer/600001",
      currency: "USD",
      subtotalAmount: 42.0,
      totalAmount: 42.0,
      lineItemsHash: "m3n4o5p6",
      startedAt: hoursAgo(10),
      lastSeenAt: hoursAgo(8),
      abandonedAt: hoursAgo(6),
      recoveryUrl: "https://organic-teas.myshopify.com/checkouts/ck_tea_001/recover",
      checkoutStatus: "ABANDONED",
    },
  });

  const checkout5 = await prisma.checkout.create({
    data: {
      shopId: shop2.id,
      shopifyCheckoutId: "gid://shopify/Checkout/200002",
      checkoutToken: "ck_tea_002",
      email: "emma@example.com",
      customerId: "gid://shopify/Customer/600002",
      currency: "USD",
      subtotalAmount: 78.5,
      totalAmount: 84.97,
      lineItemsHash: "q7r8s9t0",
      startedAt: daysAgo(3),
      lastSeenAt: daysAgo(3),
      abandonedAt: daysAgo(2),
      recoveryUrl: "https://organic-teas.myshopify.com/checkouts/ck_tea_002/recover",
      checkoutStatus: "EXPIRED",
    },
  });

  const ckLeo = await prisma.checkout.create({
    data: {
      shopId: shop2.id,
      shopifyCheckoutId: "gid://shopify/Checkout/200010",
      checkoutToken: "ck_leo_001",
      email: "leo@example.com",
      customerId: "gid://shopify/Customer/600010",
      currency: "USD",
      subtotalAmount: 52.00,
      totalAmount: 56.00,
      lineItemsHash: "le13mm33",
      startedAt: hoursAgo(8),
      lastSeenAt: hoursAgo(6),
      recoveryUrl: "https://organic-teas.myshopify.com/checkouts/ck_leo_001/recover",
      checkoutStatus: "ABANDONED",
      abandonedAt: hoursAgo(5),
    },
  });

  const ckJen = await prisma.checkout.create({
    data: {
      shopId: shop2.id,
      shopifyCheckoutId: "gid://shopify/Checkout/200011",
      checkoutToken: "ck_jen_001",
      email: "jen@example.com",
      phone: "+15559014014",
      customerId: "gid://shopify/Customer/600011",
      currency: "USD",
      subtotalAmount: 116.00,
      totalAmount: 125.00,
      lineItemsHash: "jn14nn44",
      startedAt: daysAgo(3),
      lastSeenAt: daysAgo(2),
      completedAt: daysAgo(2),
      recoveryUrl: "https://organic-teas.myshopify.com/checkouts/ck_jen_001/recover",
      checkoutStatus: "RECOVERED",
    },
  });

  console.log("  Created 19 checkouts.");

  // ── Payment Signals ───────────────────────────────────────────────────────
  const paymentSignals = await Promise.all([
    // Alice: successful payment
    prisma.paymentSignal.create({
      data: {
        shopId: shop1.id,
        checkoutId: checkout1.id,
        shopifyOrderGid: "gid://shopify/Order/100001",
        shopifyTransactionGid: "gid://shopify/OrderTransaction/900001",
        signalType: "TRANSACTION_SUCCESS",
        gateway: "shopify_payments",
        transactionKind: "sale",
        transactionStatus: "success",
        paymentMethodSummary: "Visa ending in 4242",
        amount: 96.38,
        currency: "USD",
        occurredAt: hoursAgo(6),
        rawSourceTopic: "orders/paid",
        rawSourceEventId: "evt_paid_001",
      },
    }),
    // Bob: declined payment
    prisma.paymentSignal.create({
      data: {
        shopId: shop1.id,
        checkoutId: checkout2.id,
        shopifyTransactionGid: "gid://shopify/OrderTransaction/900002",
        signalType: "TRANSACTION_FAILURE",
        gateway: "shopify_payments",
        transactionKind: "sale",
        transactionStatus: "failure",
        errorCode: "card_declined",
        paymentMethodSummary: "Mastercard ending in 8888",
        amount: 267.44,
        currency: "USD",
        occurredAt: hoursAgo(3),
        rawSourceTopic: "checkouts/create",
        rawSourceEventId: "evt_checkout_002",
      },
    }),
    // Bob: second decline attempt
    prisma.paymentSignal.create({
      data: {
        shopId: shop1.id,
        checkoutId: checkout2.id,
        shopifyTransactionGid: "gid://shopify/OrderTransaction/900003",
        signalType: "TRANSACTION_FAILURE",
        gateway: "shopify_payments",
        transactionKind: "sale",
        transactionStatus: "failure",
        errorCode: "insufficient_funds",
        paymentMethodSummary: "Mastercard ending in 8888",
        amount: 267.44,
        currency: "USD",
        occurredAt: hoursAgo(2),
        rawSourceTopic: "checkouts/create",
        rawSourceEventId: "evt_checkout_002",
      },
    }),
    // David: declined at tea shop
    prisma.paymentSignal.create({
      data: {
        shopId: shop2.id,
        checkoutId: checkout4.id,
        shopifyTransactionGid: "gid://shopify/OrderTransaction/900004",
        signalType: "TRANSACTION_FAILURE",
        gateway: "stripe",
        transactionKind: "sale",
        transactionStatus: "failure",
        errorCode: "card_declined",
        paymentMethodSummary: "Amex ending in 1234",
        amount: 42.0,
        currency: "USD",
        occurredAt: hoursAgo(8),
        rawSourceTopic: "checkouts/create",
        rawSourceEventId: "evt_checkout_tea_001",
      },
    }),
    // Emma: likely abandonment
    prisma.paymentSignal.create({
      data: {
        shopId: shop2.id,
        checkoutId: checkout5.id,
        signalType: "LIKELY_LATE_STAGE_ABANDONMENT",
        gateway: "shopify_payments",
        paymentMethodSummary: "Visa ending in 5555",
        amount: 84.97,
        currency: "USD",
        occurredAt: daysAgo(3),
      },
    }),
    // Jake: declined
    prisma.paymentSignal.create({
      data: {
        shopId: shop1.id,
        checkoutId: ckJake.id,
        shopifyTransactionGid: "gid://shopify/OrderTransaction/900010",
        signalType: "TRANSACTION_FAILURE",
        gateway: "shopify_payments",
        transactionKind: "sale",
        transactionStatus: "failure",
        errorCode: "card_declined",
        paymentMethodSummary: "Visa ending in 3311",
        amount: 189.00,
        currency: "USD",
        occurredAt: daysAgo(5),
      },
    }),
    // Maria: declined
    prisma.paymentSignal.create({
      data: {
        shopId: shop1.id,
        checkoutId: ckMaria.id,
        shopifyTransactionGid: "gid://shopify/OrderTransaction/900011",
        signalType: "TRANSACTION_FAILURE",
        gateway: "shopify_payments",
        transactionKind: "sale",
        transactionStatus: "failure",
        errorCode: "insufficient_funds",
        paymentMethodSummary: "Visa ending in 7722",
        amount: 67.00,
        currency: "USD",
        occurredAt: daysAgo(4),
      },
    }),
    // Tom: declined
    prisma.paymentSignal.create({
      data: {
        shopId: shop1.id,
        checkoutId: ckTom.id,
        shopifyTransactionGid: "gid://shopify/OrderTransaction/900012",
        signalType: "TRANSACTION_FAILURE",
        gateway: "shopify_payments",
        transactionKind: "sale",
        transactionStatus: "failure",
        errorCode: "card_declined",
        paymentMethodSummary: "Mastercard ending in 4455",
        amount: 312.00,
        currency: "USD",
        occurredAt: daysAgo(2),
      },
    }),
    // Lisa: declined
    prisma.paymentSignal.create({
      data: {
        shopId: shop1.id,
        checkoutId: ckLisa.id,
        shopifyTransactionGid: "gid://shopify/OrderTransaction/900013",
        signalType: "TRANSACTION_FAILURE",
        gateway: "shopify_payments",
        transactionKind: "sale",
        transactionStatus: "failure",
        errorCode: "do_not_honor",
        paymentMethodSummary: "Amex ending in 9988",
        amount: 145.00,
        currency: "USD",
        occurredAt: hoursAgo(13),
      },
    }),
    // Kevin: declined
    prisma.paymentSignal.create({
      data: {
        shopId: shop1.id,
        checkoutId: ckKevin.id,
        shopifyTransactionGid: "gid://shopify/OrderTransaction/900014",
        signalType: "TRANSACTION_FAILURE",
        gateway: "shopify_payments",
        transactionKind: "sale",
        transactionStatus: "failure",
        errorCode: "card_declined",
        paymentMethodSummary: "Visa ending in 6677",
        amount: 78.00,
        currency: "USD",
        occurredAt: hoursAgo(9),
      },
    }),
    // Sarah: declined
    prisma.paymentSignal.create({
      data: {
        shopId: shop1.id,
        checkoutId: ckSarah.id,
        shopifyTransactionGid: "gid://shopify/OrderTransaction/900015",
        signalType: "TRANSACTION_FAILURE",
        gateway: "shopify_payments",
        transactionKind: "sale",
        transactionStatus: "failure",
        errorCode: "insufficient_funds",
        paymentMethodSummary: "Mastercard ending in 2233",
        amount: 223.00,
        currency: "USD",
        occurredAt: hoursAgo(7),
      },
    }),
    // Mike: declined
    prisma.paymentSignal.create({
      data: {
        shopId: shop1.id,
        checkoutId: ckMike.id,
        shopifyTransactionGid: "gid://shopify/OrderTransaction/900016",
        signalType: "TRANSACTION_FAILURE",
        gateway: "shopify_payments",
        transactionKind: "sale",
        transactionStatus: "failure",
        errorCode: "card_declined",
        paymentMethodSummary: "Visa ending in 1144",
        amount: 55.00,
        currency: "USD",
        occurredAt: daysAgo(7),
      },
    }),
    // Rachel: declined
    prisma.paymentSignal.create({
      data: {
        shopId: shop1.id,
        checkoutId: ckRachel.id,
        shopifyTransactionGid: "gid://shopify/OrderTransaction/900017",
        signalType: "TRANSACTION_FAILURE",
        gateway: "shopify_payments",
        transactionKind: "sale",
        transactionStatus: "failure",
        errorCode: "expired_card",
        paymentMethodSummary: "Mastercard ending in 8899",
        amount: 92.00,
        currency: "USD",
        occurredAt: daysAgo(6),
      },
    }),
    // Dan: declined
    prisma.paymentSignal.create({
      data: {
        shopId: shop1.id,
        checkoutId: ckDan.id,
        shopifyTransactionGid: "gid://shopify/OrderTransaction/900018",
        signalType: "TRANSACTION_FAILURE",
        gateway: "shopify_payments",
        transactionKind: "sale",
        transactionStatus: "failure",
        errorCode: "card_declined",
        paymentMethodSummary: "Amex ending in 5566",
        amount: 41.00,
        currency: "USD",
        occurredAt: daysAgo(5),
      },
    }),
    // Nina: declined then self-recovered
    prisma.paymentSignal.create({
      data: {
        shopId: shop1.id,
        checkoutId: ckNina.id,
        shopifyTransactionGid: "gid://shopify/OrderTransaction/900019",
        signalType: "TRANSACTION_FAILURE",
        gateway: "shopify_payments",
        transactionKind: "sale",
        transactionStatus: "failure",
        errorCode: "insufficient_funds",
        paymentMethodSummary: "Visa ending in 3344",
        amount: 167.00,
        currency: "USD",
        occurredAt: hoursAgo(11),
      },
    }),
    // Chris: declined then self-recovered
    prisma.paymentSignal.create({
      data: {
        shopId: shop1.id,
        checkoutId: ckChris.id,
        shopifyTransactionGid: "gid://shopify/OrderTransaction/900020",
        signalType: "TRANSACTION_FAILURE",
        gateway: "shopify_payments",
        transactionKind: "sale",
        transactionStatus: "failure",
        errorCode: "card_declined",
        paymentMethodSummary: "Mastercard ending in 7788",
        amount: 88.00,
        currency: "USD",
        occurredAt: hoursAgo(5),
      },
    }),
    // Pat: declined then cancelled by merchant
    prisma.paymentSignal.create({
      data: {
        shopId: shop1.id,
        checkoutId: ckPat.id,
        shopifyTransactionGid: "gid://shopify/OrderTransaction/900021",
        signalType: "TRANSACTION_FAILURE",
        gateway: "shopify_payments",
        transactionKind: "sale",
        transactionStatus: "failure",
        errorCode: "do_not_honor",
        paymentMethodSummary: "Visa ending in 9900",
        amount: 203.00,
        currency: "USD",
        occurredAt: daysAgo(2),
      },
    }),
    // Leo: declined at tea shop
    prisma.paymentSignal.create({
      data: {
        shopId: shop2.id,
        checkoutId: ckLeo.id,
        shopifyTransactionGid: "gid://shopify/OrderTransaction/900030",
        signalType: "TRANSACTION_FAILURE",
        gateway: "stripe",
        transactionKind: "sale",
        transactionStatus: "failure",
        errorCode: "card_declined",
        paymentMethodSummary: "Visa ending in 4411",
        amount: 56.00,
        currency: "USD",
        occurredAt: hoursAgo(7),
      },
    }),
    // Jen: declined at tea shop
    prisma.paymentSignal.create({
      data: {
        shopId: shop2.id,
        checkoutId: ckJen.id,
        shopifyTransactionGid: "gid://shopify/OrderTransaction/900031",
        signalType: "TRANSACTION_FAILURE",
        gateway: "stripe",
        transactionKind: "sale",
        transactionStatus: "failure",
        errorCode: "insufficient_funds",
        paymentMethodSummary: "Mastercard ending in 2299",
        amount: 125.00,
        currency: "USD",
        occurredAt: daysAgo(3),
      },
    }),
  ]);

  console.log(`  Created ${paymentSignals.length} payment signals.`);

  // ── Recovery Cases (Shop 1) ───────────────────────────────────────────────
  // Original cases
  const case1 = await prisma.recoveryCase.create({
    data: {
      shopId: shop1.id,
      checkoutId: checkout2.id,
      caseType: "CONFIRMED_DECLINE",
      caseStatus: "MESSAGING",
      confidenceScore: 95,
      openedAt: hoursAgo(3),
      readyAt: hoursAgo(2),
      primaryReasonCode: "card_declined",
      notesJson: [
        { ts: hoursAgo(3).toISOString(), msg: "Decline detected: card_declined" },
        { ts: hoursAgo(2).toISOString(), msg: "Suppression window passed, case is READY" },
        { ts: hoursAgo(1).toISOString(), msg: "First recovery email sent" },
      ],
    },
  });

  const case4 = await prisma.recoveryCase.create({
    data: {
      shopId: shop1.id,
      checkoutId: checkout1.id,
      shopifyOrderGid: "gid://shopify/Order/100001",
      caseType: "CONFIRMED_DECLINE",
      caseStatus: "RECOVERED",
      confidenceScore: 95,
      openedAt: hoursAgo(8),
      readyAt: hoursAgo(7),
      closedAt: hoursAgo(6),
      closeReason: "order_paid",
      primaryReasonCode: "card_declined",
      notesJson: [
        { ts: hoursAgo(8).toISOString(), msg: "Decline detected" },
        { ts: hoursAgo(7).toISOString(), msg: "Recovery email sent" },
        { ts: hoursAgo(6).toISOString(), msg: "Order paid — case recovered!" },
      ],
    },
  });

  const _case5 = await prisma.recoveryCase.create({
    data: {
      shopId: shop1.id,
      checkoutId: checkout3.id,
      caseType: "CONFIRMED_DECLINE",
      caseStatus: "CANDIDATE",
      confidenceScore: 80,
      openedAt: hoursAgo(1),
      suppressionUntil: hoursFromNow(0.5),
      primaryReasonCode: "insufficient_funds",
      notesJson: [
        { ts: hoursAgo(1).toISOString(), msg: "Decline detected: insufficient_funds — in suppression window" },
      ],
    },
  });

  // New RECOVERED cases
  const caseJake = await prisma.recoveryCase.create({
    data: {
      shopId: shop1.id,
      checkoutId: ckJake.id,
      shopifyOrderGid: "gid://shopify/Order/100010",
      caseType: "CONFIRMED_DECLINE",
      caseStatus: "RECOVERED",
      confidenceScore: 92,
      openedAt: daysAgo(5),
      readyAt: daysAgo(5),
      closedAt: daysAgo(4),
      closeReason: "order_paid",
      primaryReasonCode: "card_declined",
      notesJson: [
        { ts: daysAgo(5).toISOString(), msg: "Decline detected: card_declined" },
        { ts: daysAgo(5).toISOString(), msg: "Recovery email sent" },
        { ts: daysAgo(4).toISOString(), msg: "Order paid — case recovered!" },
      ],
    },
  });

  const caseMaria = await prisma.recoveryCase.create({
    data: {
      shopId: shop1.id,
      checkoutId: ckMaria.id,
      shopifyOrderGid: "gid://shopify/Order/100011",
      caseType: "CONFIRMED_DECLINE",
      caseStatus: "RECOVERED",
      confidenceScore: 88,
      openedAt: daysAgo(4),
      readyAt: daysAgo(4),
      closedAt: daysAgo(3),
      closeReason: "order_paid",
      primaryReasonCode: "insufficient_funds",
      notesJson: [
        { ts: daysAgo(4).toISOString(), msg: "Decline detected: insufficient_funds" },
        { ts: daysAgo(4).toISOString(), msg: "Recovery email sent" },
        { ts: daysAgo(3).toISOString(), msg: "Order paid — case recovered!" },
      ],
    },
  });

  const caseTom = await prisma.recoveryCase.create({
    data: {
      shopId: shop1.id,
      checkoutId: ckTom.id,
      shopifyOrderGid: "gid://shopify/Order/100012",
      caseType: "CONFIRMED_DECLINE",
      caseStatus: "RECOVERED",
      confidenceScore: 97,
      openedAt: daysAgo(2),
      readyAt: daysAgo(2),
      closedAt: daysAgo(1),
      closeReason: "order_paid",
      primaryReasonCode: "card_declined",
      notesJson: [
        { ts: daysAgo(2).toISOString(), msg: "Decline detected: card_declined" },
        { ts: daysAgo(2).toISOString(), msg: "Recovery email sent" },
        { ts: daysAgo(1).toISOString(), msg: "Order paid — case recovered!" },
      ],
    },
  });

  // New MESSAGING cases
  const caseLisa = await prisma.recoveryCase.create({
    data: {
      shopId: shop1.id,
      checkoutId: ckLisa.id,
      caseType: "CONFIRMED_DECLINE",
      caseStatus: "MESSAGING",
      confidenceScore: 90,
      openedAt: hoursAgo(13),
      readyAt: hoursAgo(12),
      primaryReasonCode: "do_not_honor",
      notesJson: [
        { ts: hoursAgo(13).toISOString(), msg: "Decline detected: do_not_honor" },
        { ts: hoursAgo(12).toISOString(), msg: "Recovery email sent" },
      ],
    },
  });

  const caseKevin = await prisma.recoveryCase.create({
    data: {
      shopId: shop1.id,
      checkoutId: ckKevin.id,
      caseType: "CONFIRMED_DECLINE",
      caseStatus: "MESSAGING",
      confidenceScore: 85,
      openedAt: hoursAgo(9),
      readyAt: hoursAgo(8),
      primaryReasonCode: "card_declined",
      notesJson: [
        { ts: hoursAgo(9).toISOString(), msg: "Decline detected: card_declined" },
        { ts: hoursAgo(8).toISOString(), msg: "Recovery email sent" },
      ],
    },
  });

  const caseSarah = await prisma.recoveryCase.create({
    data: {
      shopId: shop1.id,
      checkoutId: ckSarah.id,
      caseType: "CONFIRMED_DECLINE",
      caseStatus: "MESSAGING",
      confidenceScore: 93,
      openedAt: hoursAgo(7),
      readyAt: hoursAgo(6),
      primaryReasonCode: "insufficient_funds",
      notesJson: [
        { ts: hoursAgo(7).toISOString(), msg: "Decline detected: insufficient_funds" },
        { ts: hoursAgo(6).toISOString(), msg: "Recovery email sent" },
      ],
    },
  });

  // New EXPIRED cases
  const caseMike = await prisma.recoveryCase.create({
    data: {
      shopId: shop1.id,
      checkoutId: ckMike.id,
      caseType: "CONFIRMED_DECLINE",
      caseStatus: "EXPIRED",
      confidenceScore: 91,
      openedAt: daysAgo(7),
      readyAt: daysAgo(7),
      closedAt: daysAgo(4),
      closeReason: "expired_no_recovery",
      primaryReasonCode: "card_declined",
      notesJson: [
        { ts: daysAgo(7).toISOString(), msg: "Decline detected: card_declined" },
        { ts: daysAgo(7).toISOString(), msg: "Recovery email sent" },
        { ts: daysAgo(4).toISOString(), msg: "Case expired after 72h" },
      ],
    },
  });

  const caseRachel = await prisma.recoveryCase.create({
    data: {
      shopId: shop1.id,
      checkoutId: ckRachel.id,
      caseType: "CONFIRMED_DECLINE",
      caseStatus: "EXPIRED",
      confidenceScore: 87,
      openedAt: daysAgo(6),
      readyAt: daysAgo(6),
      closedAt: daysAgo(3),
      closeReason: "expired_no_recovery",
      primaryReasonCode: "expired_card",
      notesJson: [
        { ts: daysAgo(6).toISOString(), msg: "Decline detected: expired_card" },
        { ts: daysAgo(6).toISOString(), msg: "Recovery email sent" },
        { ts: daysAgo(3).toISOString(), msg: "Case expired after 72h" },
      ],
    },
  });

  const caseDan = await prisma.recoveryCase.create({
    data: {
      shopId: shop1.id,
      checkoutId: ckDan.id,
      caseType: "CONFIRMED_DECLINE",
      caseStatus: "EXPIRED",
      confidenceScore: 82,
      openedAt: daysAgo(5),
      readyAt: daysAgo(5),
      closedAt: daysAgo(2),
      closeReason: "expired_no_recovery",
      primaryReasonCode: "card_declined",
      notesJson: [
        { ts: daysAgo(5).toISOString(), msg: "Decline detected: card_declined" },
        { ts: daysAgo(5).toISOString(), msg: "Recovery email sent" },
        { ts: daysAgo(2).toISOString(), msg: "Case expired after 72h" },
      ],
    },
  });

  // New SUPPRESSED cases
  await prisma.recoveryCase.create({
    data: {
      shopId: shop1.id,
      checkoutId: ckNina.id,
      caseType: "CONFIRMED_DECLINE",
      caseStatus: "SUPPRESSED",
      confidenceScore: 89,
      openedAt: hoursAgo(11),
      suppressionUntil: hoursAgo(10),
      closedAt: hoursAgo(9),
      closeReason: "success_signal_during_suppression",
      primaryReasonCode: "insufficient_funds",
      notesJson: [
        { ts: hoursAgo(11).toISOString(), msg: "Decline detected: insufficient_funds" },
        { ts: hoursAgo(9).toISOString(), msg: "Order paid during suppression — suppressed" },
      ],
    },
  });

  await prisma.recoveryCase.create({
    data: {
      shopId: shop1.id,
      checkoutId: ckChris.id,
      caseType: "CONFIRMED_DECLINE",
      caseStatus: "SUPPRESSED",
      confidenceScore: 86,
      openedAt: hoursAgo(5),
      suppressionUntil: hoursAgo(4),
      closedAt: hoursAgo(3),
      closeReason: "success_signal_during_suppression",
      primaryReasonCode: "card_declined",
      notesJson: [
        { ts: hoursAgo(5).toISOString(), msg: "Decline detected: card_declined" },
        { ts: hoursAgo(3).toISOString(), msg: "Order paid during suppression — suppressed" },
      ],
    },
  });

  // New CANCELLED case
  await prisma.recoveryCase.create({
    data: {
      shopId: shop1.id,
      checkoutId: ckPat.id,
      caseType: "CONFIRMED_DECLINE",
      caseStatus: "CANCELLED",
      confidenceScore: 78,
      openedAt: daysAgo(2),
      readyAt: daysAgo(2),
      closedAt: daysAgo(1),
      closeReason: "merchant_cancelled",
      primaryReasonCode: "do_not_honor",
      notesJson: [
        { ts: daysAgo(2).toISOString(), msg: "Decline detected: do_not_honor" },
        { ts: daysAgo(1).toISOString(), msg: "Case cancelled by merchant" },
      ],
    },
  });

  // ── Recovery Cases (Shop 2) ───────────────────────────────────────────────
  const case2 = await prisma.recoveryCase.create({
    data: {
      shopId: shop2.id,
      checkoutId: checkout4.id,
      caseType: "CONFIRMED_DECLINE",
      caseStatus: "READY",
      confidenceScore: 90,
      openedAt: hoursAgo(8),
      suppressionUntil: hoursAgo(7),
      readyAt: hoursAgo(7),
      primaryReasonCode: "card_declined",
      notesJson: [
        { ts: hoursAgo(8).toISOString(), msg: "Decline detected: card_declined" },
        { ts: hoursAgo(7).toISOString(), msg: "Suppression window passed, case is READY" },
      ],
    },
  });

  const case3 = await prisma.recoveryCase.create({
    data: {
      shopId: shop2.id,
      checkoutId: checkout5.id,
      caseType: "LIKELY_PAYMENT_STAGE_ABANDONMENT",
      caseStatus: "EXPIRED",
      confidenceScore: 65,
      openedAt: daysAgo(3),
      suppressionUntil: daysAgo(3),
      readyAt: daysAgo(3),
      closedAt: daysAgo(1),
      closeReason: "expired_no_recovery",
      primaryReasonCode: "late_stage_abandonment",
      notesJson: [
        { ts: daysAgo(3).toISOString(), msg: "Likely late-stage abandonment detected" },
        { ts: daysAgo(1).toISOString(), msg: "Case expired after 48h with no recovery" },
      ],
    },
  });

  const caseLeo = await prisma.recoveryCase.create({
    data: {
      shopId: shop2.id,
      checkoutId: ckLeo.id,
      caseType: "CONFIRMED_DECLINE",
      caseStatus: "MESSAGING",
      confidenceScore: 88,
      openedAt: hoursAgo(7),
      readyAt: hoursAgo(6),
      primaryReasonCode: "card_declined",
      notesJson: [
        { ts: hoursAgo(7).toISOString(), msg: "Decline detected: card_declined" },
        { ts: hoursAgo(6).toISOString(), msg: "Recovery email sent" },
      ],
    },
  });

  const caseJen = await prisma.recoveryCase.create({
    data: {
      shopId: shop2.id,
      checkoutId: ckJen.id,
      shopifyOrderGid: "gid://shopify/Order/200010",
      caseType: "CONFIRMED_DECLINE",
      caseStatus: "RECOVERED",
      confidenceScore: 94,
      openedAt: daysAgo(3),
      readyAt: daysAgo(3),
      closedAt: daysAgo(2),
      closeReason: "order_paid",
      primaryReasonCode: "insufficient_funds",
      notesJson: [
        { ts: daysAgo(3).toISOString(), msg: "Decline detected: insufficient_funds" },
        { ts: daysAgo(3).toISOString(), msg: "Recovery email sent" },
        { ts: daysAgo(2).toISOString(), msg: "Order paid — case recovered!" },
      ],
    },
  });

  console.log("  Created 19 recovery cases.");

  // ── Recovery Messages ─────────────────────────────────────────────────────
  const recoveryMessages = await Promise.all([
    // Case 1 (Bob, MESSAGING): sent + opened, no click
    prisma.recoveryMessage.create({
      data: {
        recoveryCaseId: case1.id,
        channel: "EMAIL",
        sequenceStep: 1,
        templateVersion: "1",
        scheduledFor: hoursAgo(1),
        sentAt: hoursAgo(1),
        deliveryStatus: "delivered",
        openedAt: hoursAgo(0.5),
        providerMessageId: "pm_msg_001",
      },
    }),
    prisma.recoveryMessage.create({
      data: {
        recoveryCaseId: case1.id,
        channel: "EMAIL",
        sequenceStep: 2,
        templateVersion: "1",
        scheduledFor: hoursFromNow(23),
        deliveryStatus: "pending",
      },
    }),
    // Case 4 (Alice, RECOVERED): sent, opened, clicked, completed
    prisma.recoveryMessage.create({
      data: {
        recoveryCaseId: case4.id,
        channel: "EMAIL",
        sequenceStep: 1,
        templateVersion: "1",
        scheduledFor: hoursAgo(7),
        sentAt: hoursAgo(7),
        deliveryStatus: "delivered",
        openedAt: hoursAgo(6.5),
        clickedAt: hoursAgo(6.25),
        checkoutCompletedAfterClickAt: hoursAgo(6),
        providerMessageId: "pm_msg_003",
      },
    }),
    // Jake (RECOVERED): sent, clicked, completed
    prisma.recoveryMessage.create({
      data: {
        recoveryCaseId: caseJake.id,
        channel: "EMAIL",
        sequenceStep: 1,
        templateVersion: "1",
        scheduledFor: daysAgo(5),
        sentAt: daysAgo(5),
        deliveryStatus: "delivered",
        openedAt: daysAgo(5),
        clickedAt: daysAgo(4),
        checkoutCompletedAfterClickAt: daysAgo(4),
        providerMessageId: "pm_msg_010",
      },
    }),
    // Maria (RECOVERED): sent, opened, clicked, completed
    prisma.recoveryMessage.create({
      data: {
        recoveryCaseId: caseMaria.id,
        channel: "EMAIL",
        sequenceStep: 1,
        templateVersion: "1",
        scheduledFor: daysAgo(4),
        sentAt: daysAgo(4),
        deliveryStatus: "delivered",
        openedAt: daysAgo(4),
        clickedAt: daysAgo(3),
        checkoutCompletedAfterClickAt: daysAgo(3),
        providerMessageId: "pm_msg_011",
      },
    }),
    // Tom (RECOVERED): sent, clicked, completed (no open tracked)
    prisma.recoveryMessage.create({
      data: {
        recoveryCaseId: caseTom.id,
        channel: "EMAIL",
        sequenceStep: 1,
        templateVersion: "1",
        scheduledFor: daysAgo(2),
        sentAt: daysAgo(2),
        deliveryStatus: "delivered",
        clickedAt: daysAgo(1),
        checkoutCompletedAfterClickAt: daysAgo(1),
        providerMessageId: "pm_msg_012",
      },
    }),
    // Lisa (MESSAGING): sent, opened, clicked (not yet recovered)
    prisma.recoveryMessage.create({
      data: {
        recoveryCaseId: caseLisa.id,
        channel: "EMAIL",
        sequenceStep: 1,
        templateVersion: "1",
        scheduledFor: hoursAgo(12),
        sentAt: hoursAgo(12),
        deliveryStatus: "delivered",
        openedAt: hoursAgo(10),
        clickedAt: hoursAgo(9),
        providerMessageId: "pm_msg_013",
      },
    }),
    prisma.recoveryMessage.create({
      data: {
        recoveryCaseId: caseLisa.id,
        channel: "EMAIL",
        sequenceStep: 2,
        templateVersion: "1",
        scheduledFor: hoursFromNow(12),
        deliveryStatus: "pending",
      },
    }),
    // Kevin (MESSAGING): sent, opened, clicked (not yet recovered)
    prisma.recoveryMessage.create({
      data: {
        recoveryCaseId: caseKevin.id,
        channel: "EMAIL",
        sequenceStep: 1,
        templateVersion: "1",
        scheduledFor: hoursAgo(8),
        sentAt: hoursAgo(8),
        deliveryStatus: "delivered",
        openedAt: hoursAgo(6),
        clickedAt: hoursAgo(5),
        providerMessageId: "pm_msg_014",
      },
    }),
    // Sarah (MESSAGING): sent, opened (no click)
    prisma.recoveryMessage.create({
      data: {
        recoveryCaseId: caseSarah.id,
        channel: "EMAIL",
        sequenceStep: 1,
        templateVersion: "1",
        scheduledFor: hoursAgo(6),
        sentAt: hoursAgo(6),
        deliveryStatus: "delivered",
        openedAt: hoursAgo(4),
        providerMessageId: "pm_msg_015",
      },
    }),
    // Mike (EXPIRED): sent, opened, clicked, but expired anyway
    prisma.recoveryMessage.create({
      data: {
        recoveryCaseId: caseMike.id,
        channel: "EMAIL",
        sequenceStep: 1,
        templateVersion: "1",
        scheduledFor: daysAgo(7),
        sentAt: daysAgo(7),
        deliveryStatus: "delivered",
        openedAt: daysAgo(6),
        clickedAt: daysAgo(6),
        providerMessageId: "pm_msg_016",
      },
    }),
    // Rachel (EXPIRED): sent, not opened
    prisma.recoveryMessage.create({
      data: {
        recoveryCaseId: caseRachel.id,
        channel: "EMAIL",
        sequenceStep: 1,
        templateVersion: "1",
        scheduledFor: daysAgo(6),
        sentAt: daysAgo(6),
        deliveryStatus: "delivered",
        providerMessageId: "pm_msg_017",
      },
    }),
    // Dan (EXPIRED): sent, not opened
    prisma.recoveryMessage.create({
      data: {
        recoveryCaseId: caseDan.id,
        channel: "EMAIL",
        sequenceStep: 1,
        templateVersion: "1",
        scheduledFor: daysAgo(5),
        sentAt: daysAgo(5),
        deliveryStatus: "delivered",
        providerMessageId: "pm_msg_018",
      },
    }),
    // Case 2 (David, READY): first email scheduled
    prisma.recoveryMessage.create({
      data: {
        recoveryCaseId: case2.id,
        channel: "EMAIL",
        sequenceStep: 1,
        templateVersion: "1",
        scheduledFor: hoursFromNow(1),
        deliveryStatus: "pending",
      },
    }),
    // Case 3 (Emma, EXPIRED): email sent but never opened
    prisma.recoveryMessage.create({
      data: {
        recoveryCaseId: case3.id,
        channel: "EMAIL",
        sequenceStep: 1,
        templateVersion: "1",
        scheduledFor: daysAgo(3),
        sentAt: daysAgo(3),
        deliveryStatus: "delivered",
        providerMessageId: "pm_msg_002",
      },
    }),
    // Leo (MESSAGING): sent, opened
    prisma.recoveryMessage.create({
      data: {
        recoveryCaseId: caseLeo.id,
        channel: "EMAIL",
        sequenceStep: 1,
        templateVersion: "1",
        scheduledFor: hoursAgo(6),
        sentAt: hoursAgo(6),
        deliveryStatus: "delivered",
        openedAt: hoursAgo(4),
        providerMessageId: "pm_msg_030",
      },
    }),
    // Jen (RECOVERED): sent, clicked, completed
    prisma.recoveryMessage.create({
      data: {
        recoveryCaseId: caseJen.id,
        channel: "EMAIL",
        sequenceStep: 1,
        templateVersion: "1",
        scheduledFor: daysAgo(3),
        sentAt: daysAgo(3),
        deliveryStatus: "delivered",
        openedAt: daysAgo(2),
        clickedAt: daysAgo(2),
        checkoutCompletedAfterClickAt: daysAgo(2),
        providerMessageId: "pm_msg_031",
      },
    }),
  ]);

  console.log(`  Created ${recoveryMessages.length} recovery messages.`);

  // ── Orders Index ──────────────────────────────────────────────────────────
  const orders = await Promise.all([
    prisma.ordersIndex.create({
      data: {
        shopId: shop1.id,
        shopifyOrderGid: "gid://shopify/Order/100001",
        orderName: "#1001",
        email: "alice@example.com",
        customerId: "gid://shopify/Customer/500001",
        financialStatus: "paid",
        gatewayNamesJson: ["shopify_payments"],
        paidAt: hoursAgo(6),
        checkoutRecoveryAttributedCaseId: case4.id,
      },
    }),
    prisma.ordersIndex.create({
      data: {
        shopId: shop1.id,
        shopifyOrderGid: "gid://shopify/Order/100002",
        orderName: "#1002",
        email: "frank@example.com",
        customerId: "gid://shopify/Customer/500004",
        financialStatus: "paid",
        gatewayNamesJson: ["shopify_payments"],
        paidAt: daysAgo(2),
      },
    }),
    // Jake recovered order
    prisma.ordersIndex.create({
      data: {
        shopId: shop1.id,
        shopifyOrderGid: "gid://shopify/Order/100010",
        orderName: "#1010",
        email: "jake@example.com",
        customerId: "gid://shopify/Customer/500010",
        financialStatus: "paid",
        gatewayNamesJson: ["shopify_payments"],
        paidAt: daysAgo(4),
        checkoutRecoveryAttributedCaseId: caseJake.id,
      },
    }),
    // Maria recovered order
    prisma.ordersIndex.create({
      data: {
        shopId: shop1.id,
        shopifyOrderGid: "gid://shopify/Order/100011",
        orderName: "#1011",
        email: "maria@example.com",
        customerId: "gid://shopify/Customer/500011",
        financialStatus: "paid",
        gatewayNamesJson: ["shopify_payments"],
        paidAt: daysAgo(3),
        checkoutRecoveryAttributedCaseId: caseMaria.id,
      },
    }),
    // Tom recovered order
    prisma.ordersIndex.create({
      data: {
        shopId: shop1.id,
        shopifyOrderGid: "gid://shopify/Order/100012",
        orderName: "#1012",
        email: "tom@example.com",
        customerId: "gid://shopify/Customer/500012",
        financialStatus: "paid",
        gatewayNamesJson: ["shopify_payments"],
        paidAt: daysAgo(1),
        checkoutRecoveryAttributedCaseId: caseTom.id,
      },
    }),
    prisma.ordersIndex.create({
      data: {
        shopId: shop2.id,
        shopifyOrderGid: "gid://shopify/Order/200001",
        orderName: "#2001",
        email: "grace@example.com",
        customerId: "gid://shopify/Customer/600003",
        financialStatus: "paid",
        gatewayNamesJson: ["stripe"],
        paidAt: daysAgo(5),
      },
    }),
    prisma.ordersIndex.create({
      data: {
        shopId: shop2.id,
        shopifyOrderGid: "gid://shopify/Order/200002",
        orderName: "#2002",
        email: "henry@example.com",
        customerId: "gid://shopify/Customer/600004",
        financialStatus: "refunded",
        gatewayNamesJson: ["stripe"],
        paidAt: daysAgo(7),
        cancelledAt: daysAgo(4),
      },
    }),
    // Jen recovered order
    prisma.ordersIndex.create({
      data: {
        shopId: shop2.id,
        shopifyOrderGid: "gid://shopify/Order/200010",
        orderName: "#2010",
        email: "jen@example.com",
        customerId: "gid://shopify/Customer/600011",
        financialStatus: "paid",
        gatewayNamesJson: ["stripe"],
        paidAt: daysAgo(2),
        checkoutRecoveryAttributedCaseId: caseJen.id,
      },
    }),
  ]);

  console.log(`  Created ${orders.length} orders index entries.`);

  // ── Summary ───────────────────────────────────────────────────────────────
  console.log("\n✅ Seed complete!");
  console.log("\n📊 Summary:");
  console.log("   Shops:             2");
  console.log(`   Webhook Events:    ${webhookEvents.length}`);
  console.log("   Checkouts:         19");
  console.log(`   Payment Signals:   ${paymentSignals.length}`);
  console.log("   Recovery Cases:    19");
  console.log("     Shop 1:  15  (4 RECOVERED, 4 MESSAGING, 1 CANDIDATE, 3 EXPIRED, 2 SUPPRESSED, 1 CANCELLED)");
  console.log("     Shop 2:   4  (1 RECOVERED, 1 MESSAGING, 1 READY, 1 EXPIRED)");
  console.log(`   Recovery Messages: ${recoveryMessages.length}`);
  console.log(`   Orders Index:      ${orders.length}`);
  console.log("\n📈 Expected Funnel (Shop 1):");
  console.log("   Declined: 15 → Messaged: 11 → Clicked: 7 → Recovered: 4");
}

main()
  .catch((e) => {
    console.error("❌ Seed failed:", e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
