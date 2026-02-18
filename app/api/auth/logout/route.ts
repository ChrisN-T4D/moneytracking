import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { AUTH_COOKIE_NAME } from "@/lib/pocketbase-auth";

export const dynamic = "force-dynamic";

/** POST /api/auth/logout — clears auth cookie. */
export async function POST() {
  const cookieStore = await cookies();
  cookieStore.delete({ name: AUTH_COOKIE_NAME, path: "/" });
  return NextResponse.json({ ok: true });
}
