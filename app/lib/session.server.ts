import { createCookieSessionStorage } from "@remix-run/node";

const sessionSecret = process.env.SESSION_SECRET;
if (!sessionSecret) {
  throw new Error("SESSION_SECRET must be set");
}

export const sessionStorage = createCookieSessionStorage({
  cookie: {
    name: "__session",
    httpOnly: true,
    path: "/",
    sameSite: "lax",
    secrets: [sessionSecret],
    secure: process.env.NODE_ENV === "production",
    maxAge: 60 * 60 * 24 * 30, // 30 days
  },
});

export async function getSession(request: Request) {
  return sessionStorage.getSession(request.headers.get("Cookie"));
}

export async function getShopId(request: Request): Promise<number | null> {
  const session = await getSession(request);
  const shopId = session.get("shopId");
  return typeof shopId === "number" ? shopId : null;
}

export async function requireShopId(request: Request): Promise<number> {
  const shopId = await getShopId(request);
  if (!shopId) {
    throw new Response("Unauthorized", { status: 401 });
  }
  return shopId;
}
