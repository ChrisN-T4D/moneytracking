import { NextResponse } from "next/server";
import { getTokenFromCookie, hasPbAuth } from "@/lib/pocketbase-auth";

export const dynamic = "force-dynamic";

/**
 * Returns the PocketBase user JWT for the current session.
 * The auth cookie is httpOnly, so the official JS client cannot read it; this route is same-origin only.
 * Used to open PocketBase Realtime so mark-paid and other PB changes refresh all open tabs.
 */
export async function GET() {
  if (!hasPbAuth()) {
    return NextResponse.json(
      { message: "PocketBase not configured." },
      { status: 400 }
    );
  }
  const token = await getTokenFromCookie();
  if (!token?.trim()) {
    return NextResponse.json({ message: "Not signed in." }, { status: 401 });
  }
  return NextResponse.json(
    { token: token.trim() },
    { headers: { "Cache-Control": "no-store" } }
  );
}
