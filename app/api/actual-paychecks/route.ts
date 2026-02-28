import { NextResponse } from "next/server";
import { getStatements } from "@/lib/pocketbase";
import { getPaycheckDepositsThisMonth } from "@/lib/statementsAnalysis";

export const dynamic = "force-dynamic";

/**
 * GET /api/actual-paychecks?month=YYYY-MM
 * Returns actual paycheck deposits for the given calendar month (from statements).
 * Used when server-rendered data shows 0 so the client can refetch.
 */
export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const month = searchParams.get("month");
  if (!month || !/^\d{4}-\d{2}$/.test(month)) {
    return NextResponse.json({ ok: false, message: "Missing or invalid month (use YYYY-MM)." }, { status: 400 });
  }
  const [y, m] = month.split("-").map(Number);
  if (y == null || m == null || m < 1 || m > 12) {
    return NextResponse.json({ ok: false, message: "Invalid month." }, { status: 400 });
  }
  const refDate = new Date(y, m - 1, 15);
  const statements = await getStatements({ perPage: 2000, sort: "-date" });
  const actual = getPaycheckDepositsThisMonth(statements, refDate);
  return NextResponse.json({ ok: true, actual, month });
}
