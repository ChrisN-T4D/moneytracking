import { NextResponse } from "next/server";
import { buildClearAuthCookie } from "@/lib/pocketbase-auth";

export const dynamic = "force-dynamic";

/** POST /api/auth/logout — clears auth cookie. */
export async function POST() {
  const response = NextResponse.json({ ok: true });
  response.headers.set("Set-Cookie", buildClearAuthCookie());
  return response;
}
