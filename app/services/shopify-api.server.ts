import type { Shop } from "@prisma/client";
import { getAccessToken } from "~/models/shop.server";

const SHOPIFY_API_VERSION = "2024-10";

const SHOPIFY_SCOPES = "read_orders";

export function getShopifyOAuthUrl(
  shopDomain: string,
  nonce: string
): string {
  const apiKey = process.env.SHOPIFY_API_KEY;
  const redirectUri = `${process.env.APP_URL}/auth/callback`;

  return (
    `https://${shopDomain}/admin/oauth/authorize` +
    `?client_id=${apiKey}` +
    `&scope=${SHOPIFY_SCOPES}` +
    `&redirect_uri=${encodeURIComponent(redirectUri)}` +
    `&state=${nonce}`
  );
}

export async function registerWebhooks(
  shopDomain: string,
  accessToken: string
): Promise<void> {
  const topics = [
    "orders/create",
    "orders/updated",
    "checkouts/create",
    "checkouts/update",
    "app/uninstalled",
  ];

  const appUrl = process.env.APP_URL;
  const results = await Promise.allSettled(
    topics.map((topic) =>
      fetch(
        `https://${shopDomain}/admin/api/${SHOPIFY_API_VERSION}/webhooks.json`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "X-Shopify-Access-Token": accessToken,
          },
          body: JSON.stringify({
            webhook: {
              topic,
              address: `${appUrl}/webhooks/shopify`,
              format: "json",
            },
          }),
        }
      ).then(async (res) => {
        if (!res.ok) {
          const body = await res.text();
          console.error(
            `Failed to register webhook ${topic}: ${res.status} ${body}`
          );
        }
        return { topic, status: res.status };
      })
    )
  );

  const registered = results.filter(
    (r) => r.status === "fulfilled" && r.value.status >= 200 && r.value.status < 300
  ).length;
  console.log(
    `Registered ${registered}/${topics.length} webhooks for ${shopDomain}`
  );
}

export async function exchangeCodeForToken(
  shopDomain: string,
  code: string
): Promise<string> {
  const response = await fetch(
    `https://${shopDomain}/admin/oauth/access_token`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        client_id: process.env.SHOPIFY_API_KEY,
        client_secret: process.env.SHOPIFY_API_SECRET,
        code,
      }),
    }
  );

  if (!response.ok) {
    throw new Error(`Shopify OAuth failed: ${response.status}`);
  }

  const data = (await response.json()) as { access_token: string };
  return data.access_token;
}

export async function shopifyGraphQL<T>(
  shop: Shop,
  query: string,
  variables?: Record<string, unknown>
): Promise<T> {
  const accessToken = getAccessToken(shop);

  const response = await fetch(
    `https://${shop.shopDomain}/admin/api/${SHOPIFY_API_VERSION}/graphql.json`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Shopify-Access-Token": accessToken,
      },
      body: JSON.stringify({ query, variables }),
    }
  );

  if (!response.ok) {
    throw new Error(`Shopify GraphQL error: ${response.status}`);
  }

  const result = (await response.json()) as { data: T; errors?: unknown[] };

  if (result.errors && (result.errors as unknown[]).length > 0) {
    console.error("Shopify GraphQL errors:", result.errors);
  }

  return result.data;
}

export const QUERIES = {
  abandonedCheckouts: `
    query AbandonedCheckouts($first: Int!, $after: String) {
      abandonedCheckouts(first: $first, after: $after, sortKey: UPDATED_AT, reverse: true) {
        edges {
          node {
            id
            createdAt
            updatedAt
            completedAt
            abandonedCheckoutUrl
            totalPriceSet {
              shopMoney { amount currencyCode }
            }
            customer {
              id
              email
              phone
            }
            lineItems(first: 10) {
              edges {
                node { title quantity }
              }
            }
          }
        }
        pageInfo { hasNextPage endCursor }
      }
    }
  `,

  orderWithTransactions: `
    query OrderWithTransactions($id: ID!) {
      order(id: $id) {
        id
        name
        displayFinancialStatus
        customer { id email }
        transactions(first: 20) {
          id
          kind
          status
          errorCode
          gateway
          processedAt
          amountSet {
            shopMoney { amount currencyCode }
          }
          paymentDetails {
            ... on CardPaymentDetails {
              company
              number
            }
          }
        }
      }
    }
  `,
} as const;
