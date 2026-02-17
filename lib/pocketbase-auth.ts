/**
 * PocketBase user auth helpers for Next.js API routes.
 * Uses httpOnly cookie for the auth token.
 */

import { cookies } from "next/headers";

const POCKETBASE_URL = process.env.NEXT_PUBLIC_POCKETBASE_URL ?? "";
const BASE = (() => {
  const b = POCKETBASE_URL.replace(/\/$/, "");
  if (b.endsWith("/_")) return b.replace(/\/_\/?$/, "") || b;
  return b;
})();

export const AUTH_COOKIE_NAME = "pb_auth";

export function getPbBase(): string {
  return BASE;
}

export function hasPbAuth(): boolean {
  return Boolean(POCKETBASE_URL);
}

/** Get the auth token from the request cookie. */
export async function getTokenFromCookie(): Promise<string | undefined> {
  const cookieStore = await cookies();
  const cookie = cookieStore.get(AUTH_COOKIE_NAME);
  return cookie?.value;
}

/** Fetch from PocketBase with Bearer token. */
export async function pbAuthFetch<T>(
  path: string,
  options: RequestInit = {},
  token: string
): Promise<T> {
  const url = `${BASE}${path}`;
  const res = await fetch(url, {
    ...options,
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
      ...options.headers,
    },
    cache: "no-store",
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`PocketBase auth request failed: ${res.status} ${text}`);
  }
  return res.json() as Promise<T>;
}

/** Build Set-Cookie header value for auth token. */
export function buildAuthCookie(token: string): string {
  const isProd = process.env.NODE_ENV === "production";
  const maxAge = 60 * 60 * 24 * 14; // 14 days
  let value = `${AUTH_COOKIE_NAME}=${encodeURIComponent(token)}; Path=/; Max-Age=${maxAge}; SameSite=Lax`;
  if (isProd) value += "; Secure";
  value += "; HttpOnly";
  return value;
}

/** Build Set-Cookie header value to clear auth. */
export function buildClearAuthCookie(): string {
  return `${AUTH_COOKIE_NAME}=; Path=/; Max-Age=0; SameSite=Lax; HttpOnly`;
}
