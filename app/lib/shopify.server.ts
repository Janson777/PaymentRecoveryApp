import { createHmac } from "node:crypto";

const MYSHOPIFY_DOMAIN_REGEX =
  /^[a-zA-Z0-9][a-zA-Z0-9-]*\.myshopify\.com$/;

export function isValidShopDomain(shop: string): boolean {
  return MYSHOPIFY_DOMAIN_REGEX.test(shop);
}

export function sanitizeShopDomain(input: string): string {
  let domain = input.trim().toLowerCase();
  domain = domain.replace(/^https?:\/\//, "");
  domain = domain.replace(/\/.*$/, "");
  if (!domain.includes(".")) {
    domain = `${domain}.myshopify.com`;
  }
  return domain;
}

export function verifyOAuthHmac(
  query: URLSearchParams,
  secret: string
): boolean {
  const hmac = query.get("hmac");
  if (!hmac) return false;

  const params = new URLSearchParams(query);
  params.delete("hmac");

  const sortedKeys = [...params.keys()].sort();
  const message = sortedKeys
    .map((key) => `${key}=${params.get(key)}`)
    .join("&");

  const computed = createHmac("sha256", secret)
    .update(message)
    .digest("hex");

  return computed === hmac;
}
