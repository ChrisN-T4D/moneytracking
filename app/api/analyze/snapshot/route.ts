import { NextResponse } from "next/server";
import { getTokenFromCookie } from "@/lib/pocketbase-auth";
import { buildAnalyzeSnapshot } from "@/lib/analyzeSnapshot";

export const dynamic = "force-dynamic";

export async function GET() {
  const token = await getTokenFromCookie().catch(() => null);
  if (!token) {
    return NextResponse.json({ ok: false, message: "Not authenticated." }, { status: 401 });
  }
  try {
    const snapshot = await buildAnalyzeSnapshot();
    return NextResponse.json({ ok: true, snapshot });
  } catch (e) {
    return NextResponse.json(
      { ok: false, message: e instanceof Error ? e.message : "Snapshot failed." },
      { status: 500 }
    );
  }
}
