import { NextResponse } from "next/server";
import { getStatements } from "@/lib/pocketbase";
import { getTokenFromCookie } from "@/lib/pocketbase-auth";
import { buildStatementAnalytics } from "@/lib/statementAnalytics";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const token = await getTokenFromCookie().catch(() => null);
  if (!token) {
    return NextResponse.json({ ok: false, message: "Not authenticated." }, { status: 401 });
  }

  const url = new URL(request.url);
  const from = url.searchParams.get("from") ?? undefined;
  const to = url.searchParams.get("to") ?? undefined;
  const account = url.searchParams.get("account") ?? undefined;

  const statements = await getStatements({ perPage: 1000, sort: "-date" });
  const analytics = buildStatementAnalytics(statements, { from, to, account });

  return NextResponse.json({ ok: true, analytics });
}
