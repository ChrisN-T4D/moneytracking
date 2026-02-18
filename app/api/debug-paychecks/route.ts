import { NextResponse } from "next/server";
import { getPaychecks, getStatements } from "@/lib/pocketbase";
import { getPaycheckDepositsThisMonth } from "@/lib/statementsAnalysis";

const POCKETBASE_URL = process.env.NEXT_PUBLIC_POCKETBASE_URL ?? "";
const BASE = (() => {
  const b = POCKETBASE_URL.replace(/\/$/, "");
  if (b.endsWith("/_")) return b.replace(/\/_\/?$/, "") || b;
  return b;
})();

export const dynamic = "force-dynamic";

export async function GET() {
  const today = new Date();

  try {
    const [paychecks, statements] = await Promise.all([
      getPaychecks(),
      getStatements({ perPage: 1000, sort: "-date" }),
    ]);

    const currentYearMonth = `${today.getFullYear()}-${String(
      today.getMonth() + 1,
    ).padStart(2, "0")}`;

    const fromStatements =
      statements.length > 0 ? getPaycheckDepositsThisMonth(statements, today) : 0;

    const fromAddedPaychecks =
      paychecks.length > 0
        ? paychecks
            .filter(
              (p) =>
                p.paidThisMonthYearMonth === currentYearMonth &&
                (p.amountPaidThisMonth ?? 0) > 0,
            )
            .reduce((sum, p) => sum + (p.amountPaidThisMonth ?? 0), 0)
        : 0;

    const paycheckPaidThisMonth = fromStatements + fromAddedPaychecks;

    let rawPbPaychecks: unknown = null;
    let pbStatus: number | null = null;
    let pbError: string | null = null;
    const hasPbUrl = Boolean(POCKETBASE_URL);

    if (BASE) {
      try {
        const res = await fetch(`${BASE}/api/collections/paychecks/records`, { cache: "no-store" });
        pbStatus = res.status;
        if (res.ok) {
          rawPbPaychecks = (await res.json()) as { items?: unknown[] };
        } else {
          pbError = await res.text();
        }
      } catch (e) {
        pbError = e instanceof Error ? e.message : String(e);
      }
    }

    return NextResponse.json({
      today: today.toISOString(),
      currentYearMonth,
      fromStatements,
      fromAddedPaychecks,
      paycheckPaidThisMonth,
      paychecks,
      debug: {
        hasPbUrl,
        pbUrlSet: hasPbUrl ? "yes" : "no (set NEXT_PUBLIC_POCKETBASE_URL in .env.local)",
        pbStatus,
        pbError: pbError ?? null,
      },
      rawPbPaychecksItems: Array.isArray((rawPbPaychecks as { items?: unknown[] })?.items)
        ? (rawPbPaychecks as { items: unknown[] }).items
        : null,
      sampleStatements: statements.slice(0, 5),
    });
  } catch (e) {
    return NextResponse.json(
      {
        ok: false,
        error: e instanceof Error ? e.message : String(e),
      },
      { status: 500 },
    );
  }
}

