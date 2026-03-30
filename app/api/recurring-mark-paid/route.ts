import { NextResponse } from "next/server";
import { getTokenFromCookie, getPbBase } from "@/lib/pocketbase-auth";
import { getAdminToken } from "@/lib/pocketbase-setup";
import { syncGoalFromStatements } from "@/lib/recalculateGoalFromStatements";
import { PB, isPbRecordId } from "@/lib/pbFieldMap";

export const dynamic = "force-dynamic";

async function resolveAuth(): Promise<{
  token: string | null;
  apiBase: string;
}> {
  const base = getPbBase();
  if (!base) return { token: null, apiBase: "" };
  let token: string | null =
    (await getTokenFromCookie().catch(() => null)) ?? null;
  let apiBase = base;
  if (!token) {
    const email = process.env.POCKETBASE_ADMIN_EMAIL ?? "";
    const password = process.env.POCKETBASE_ADMIN_PASSWORD ?? "";
    if (email && password) {
      try {
        const r = await getAdminToken(base, email, password);
        token = r.token;
        apiBase = r.baseUrl;
      } catch {
        /* */
      }
    }
  }
  return { token, apiBase };
}

function paidFields(collection: "bills" | "spanish_fork_bills") {
  return collection === "bills" ? PB.bills : PB.spanishForkBills;
}

interface MarkBody {
  action: "mark";
  collection: "bills" | "spanish_fork_bills";
  billIds: string[];
  cycleKey: string;
  goalId: string | null;
  creditAmount: number;
  dateYmd: string;
  lineLabel: string;
}

interface UnmarkBody {
  action: "unmark";
  collection: "bills" | "spanish_fork_bills";
  billIds: string[];
  storedStatementId?: string | null;
  storedGoalId?: string | null;
}

export async function POST(request: Request) {
  const { token, apiBase } = await resolveAuth();
  if (!token || !apiBase) {
    return NextResponse.json(
      { ok: false, message: "Not authenticated." },
      { status: 401 }
    );
  }

  const authHeaders: Record<string, string> = {
    Authorization: `Bearer ${token}`,
    "Content-Type": "application/json",
  };
  const base = apiBase.replace(/\/$/, "");

  let body: MarkBody | UnmarkBody;
  try {
    body = (await request.json()) as MarkBody | UnmarkBody;
  } catch {
    return NextResponse.json(
      { ok: false, message: "Invalid JSON." },
      { status: 400 }
    );
  }

  const action = (body as { action?: string }).action;

  // ── MARK PAID ──────────────────────────────────────────────
  if (action === "mark") {
    const b = body as MarkBody;
    const col = b.collection ?? "bills";
    const ids = (b.billIds ?? []).filter((id) => isPbRecordId(id));
    if (ids.length === 0) {
      return NextResponse.json(
        { ok: false, message: "billIds required (must be valid PB ids)." },
        { status: 400 }
      );
    }
    const cycleKey = String(b.cycleKey ?? "").trim();
    if (!cycleKey) {
      return NextResponse.json(
        { ok: false, message: "cycleKey required." },
        { status: 400 }
      );
    }
    const goalId = b.goalId?.trim() || null;
    const creditAmount = Number(b.creditAmount) || 0;
    const dateYmd = String(b.dateYmd ?? "").trim().slice(0, 10);
    if (!dateYmd) {
      return NextResponse.json(
        { ok: false, message: "dateYmd required." },
        { status: 400 }
      );
    }
    const lineLabel = String(b.lineLabel ?? "Bill").trim() || "Bill";
    const fields = paidFields(col);

    // 1. Create statement row (with goalid linked) if there's a goal + credit
    let statementId: string | null = null;
    if (goalId && creditAmount > 0) {
      const desc = `Recurring: ${lineLabel} (${cycleKey}) — $${creditAmount.toFixed(2)}`;
      const postRes = await fetch(
        `${base}/api/collections/statements/records`,
        {
          method: "POST",
          headers: authHeaders,
          body: JSON.stringify({
            date: dateYmd,
            description: desc,
            amount: creditAmount,
            [PB.statements.sourceFile]: "recurring_tab",
            [PB.statements.goalId]: goalId,
          }),
          cache: "no-store",
        }
      );
      if (!postRes.ok) {
        const t = await postRes.text();
        return NextResponse.json(
          {
            ok: false,
            message: `Could not create statement: ${postRes.status} ${t}`,
          },
          { status: 502 }
        );
      }
      const created = (await postRes.json()) as { id?: string };
      statementId = created.id?.trim() || null;
      if (!statementId) {
        return NextResponse.json(
          { ok: false, message: "Statement created but no id returned." },
          { status: 502 }
        );
      }
    }

    // 2. PATCH each bill with cycle / goal / statement id
    for (const id of ids) {
      const patchRes = await fetch(
        `${base}/api/collections/${col}/records/${id}`,
        {
          method: "PATCH",
          headers: authHeaders,
          body: JSON.stringify({
            [fields.paidCycle]: cycleKey,
            [fields.paidGoalId]: goalId,
            [fields.paidStatementId]: statementId,
          }),
          cache: "no-store",
        }
      );
      if (!patchRes.ok) {
        const t = await patchRes.text();
        return NextResponse.json(
          {
            ok: false,
            message: `Could not update ${col} ${id}: ${patchRes.status} ${t}`,
          },
          { status: 502 }
        );
      }
    }

    // 3. Sync goal currentAmount from statements
    if (goalId && creditAmount > 0) {
      const { ok } = await syncGoalFromStatements(goalId, base, authHeaders);
      if (!ok) {
        return NextResponse.json(
          {
            ok: false,
            message:
              "Bills updated and statement created, but could not sync goal progress.",
          },
          { status: 502 }
        );
      }
    }

    const { revalidatePath } = await import("next/cache");
    revalidatePath("/");
    return NextResponse.json({ ok: true, statementId });
  }

  // ── UNMARK PAID ────────────────────────────────────────────
  if (action === "unmark") {
    const b = body as UnmarkBody;
    const col = b.collection ?? "bills";
    const ids = (b.billIds ?? []).filter((id) => isPbRecordId(id));
    if (ids.length === 0) {
      return NextResponse.json(
        { ok: false, message: "billIds required." },
        { status: 400 }
      );
    }
    const fields = paidFields(col);
    const readHeaders = { Authorization: `Bearer ${token}` };

    // Resolve stored ids from the first bill record if not provided
    let statementId = b.storedStatementId?.trim() || null;
    let goalId = b.storedGoalId?.trim() || null;
    if ((!statementId || !goalId) && ids[0]) {
      const getRes = await fetch(
        `${base}/api/collections/${col}/records/${ids[0]}`,
        { headers: readHeaders, cache: "no-store" }
      );
      if (getRes.ok) {
        const rec = (await getRes.json()) as Record<string, unknown>;
        if (!statementId) {
          const sid = String(rec[fields.paidStatementId] ?? "").trim();
          if (sid) statementId = sid;
        }
        if (!goalId) {
          const gid = String(rec[fields.paidGoalId] ?? "").trim();
          if (gid) goalId = gid;
        }
      }
    }

    // 1. Delete statement if exists
    if (statementId) {
      await fetch(
        `${base}/api/collections/statements/records/${statementId}`,
        { method: "DELETE", headers: readHeaders, cache: "no-store" }
      );
    }

    // 2. Clear recurring fields on all bills
    for (const id of ids) {
      await fetch(`${base}/api/collections/${col}/records/${id}`, {
        method: "PATCH",
        headers: authHeaders,
        body: JSON.stringify({
          [fields.paidCycle]: null,
          [fields.paidGoalId]: null,
          [fields.paidStatementId]: null,
        }),
        cache: "no-store",
      });
    }

    // 3. Resync goal if there was one
    if (goalId) {
      await syncGoalFromStatements(goalId, base, authHeaders);
    }

    const { revalidatePath } = await import("next/cache");
    revalidatePath("/");
    return NextResponse.json({ ok: true });
  }

  return NextResponse.json(
    { ok: false, message: "Invalid action." },
    { status: 400 }
  );
}
