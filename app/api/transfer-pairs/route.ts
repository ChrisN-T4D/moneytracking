import { NextResponse } from "next/server";
import { getAdminToken } from "@/lib/pocketbase-setup";
import { makeStatementPattern } from "@/lib/statementTagging";
import { PB } from "@/lib/pbFieldMap";
import { syncGoalFromStatements } from "@/lib/recalculateGoalFromStatements";

export const dynamic = "force-dynamic";

const baseUrlForAuth = () =>
  (process.env.POCKETBASE_API_URL ?? process.env.NEXT_PUBLIC_POCKETBASE_URL ?? "").trim();

interface BillTagPayload {
  section: string;
  listType: string;
  name: string;
}

interface PairPayload {
  outStatementId: string;
  inStatementId: string;
  fromAccount: string;
  toAccount: string;
  goalId?: string | null;
  outflowBillTag?: BillTagPayload;
  outflowDescription?: string;
}

interface UnpairedPayload {
  statementId: string;
  goalId?: string | null;
  fromAccount?: string | null;
  toAccount?: string | null;
  billTag?: BillTagPayload;
  description?: string;
}

/** POST /api/transfer-pairs — save transfer pairings, update statements and goals. */
export async function POST(request: Request) {
  const url = baseUrlForAuth();
  const email = process.env.POCKETBASE_ADMIN_EMAIL ?? "";
  const password = process.env.POCKETBASE_ADMIN_PASSWORD ?? "";

  if (!url || !email || !password) {
    return NextResponse.json({ ok: false, message: "PocketBase admin credentials not configured." }, { status: 500 });
  }

  let token: string;
  let resolvedBase: string;
  try {
    const r = await getAdminToken(url, email, password);
    token = r.token;
    resolvedBase = r.baseUrl.replace(/\/$/, "");
  } catch {
    return NextResponse.json({ ok: false, message: "Admin auth failed." }, { status: 401 });
  }

  let body: { pairs?: PairPayload[]; unpaired?: UnpairedPayload[] };
  try {
    body = (await request.json()) as { pairs?: PairPayload[]; unpaired?: UnpairedPayload[] };
  } catch {
    return NextResponse.json({ ok: false, message: "Invalid JSON body." }, { status: 400 });
  }

  const pairs = body.pairs ?? [];
  const unpaired = body.unpaired ?? [];
  if (pairs.length === 0 && unpaired.length === 0) {
    return NextResponse.json({ ok: true, saved: 0, message: "Nothing to save." });
  }

  let saved = 0;
  const authHeaders = { "Content-Type": "application/json", Authorization: `Bearer ${token}` };

  const S = PB.statements;
  const R = PB.statementTagRules;

  async function patchStatement(statementId: string, fields: Record<string, unknown>): Promise<boolean> {
    const res = await fetch(
      `${resolvedBase}/api/collections/statements/records/${statementId}`,
      { method: "PATCH", headers: authHeaders, body: JSON.stringify(fields) }
    );
    return res.ok;
  }

  async function upsertRule(description: string, rulePayload: Record<string, unknown>): Promise<boolean> {
    const pattern = makeStatementPattern(description);
    if (!pattern) return false;
    const fullPayload = { pattern, ...rulePayload };
    try {
      const escaped = pattern.replace(/\\/g, "\\\\").replace(/"/g, '\\"');
      const filter = encodeURIComponent(`pattern="${escaped}"`);
      const listRes = await fetch(
        `${resolvedBase}/api/collections/statement_tag_rules/records?perPage=1&filter=${filter}`,
        { headers: { Authorization: `Bearer ${token}` }, cache: "no-store" }
      );
      if (!listRes.ok) return false;
      const listData = (await listRes.json()) as { items?: { id: string }[] };
      const existing = listData.items?.[0];
      if (existing) {
        const res = await fetch(`${resolvedBase}/api/collections/statement_tag_rules/records/${existing.id}`, {
          method: "PATCH", headers: authHeaders, body: JSON.stringify(fullPayload),
        });
        return res.ok;
      } else {
        const res = await fetch(`${resolvedBase}/api/collections/statement_tag_rules/records`, {
          method: "POST", headers: authHeaders, body: JSON.stringify(fullPayload),
        });
        return res.ok;
      }
    } catch {
      return false;
    }
  }

  async function upsertBillRule(description: string, tag: BillTagPayload): Promise<boolean> {
    const targetType = tag.listType === "subscriptions" ? "subscription" : "bill";
    const targetSection = tag.section === "spanish_fork" ? "spanish_fork" : tag.section === "bills_account" ? "bills_account" : "checking_account";
    const payload: Record<string, unknown> = {
      [R.normalizedDescription]: tag.name,
      [R.targetType]: targetType,
      [R.targetSection]: targetSection,
      [R.targetName]: tag.name,
      [R.goalId]: null,
    };
    return upsertRule(description, payload);
  }

  const goalIdsToUpdate = new Set<string>();

  for (const pair of pairs) {
    const goalId = pair.goalId?.trim() || null;
    const goalValue = goalId ?? "";
    const outDesc = pair.outflowDescription?.trim() ?? "";

    const outPayload: Record<string, unknown> = {
      [S.pairedStatementId]: pair.inStatementId,
      [S.transferFromAccount]: pair.fromAccount,
      [S.transferToAccount]: pair.toAccount,
      [S.goalId]: goalValue,
    };
    if (pair.outflowBillTag) {
      outPayload[S.targetType] = pair.outflowBillTag.listType === "subscriptions" ? "subscription" : "bill";
      outPayload[S.targetSection] = pair.outflowBillTag.section === "spanish_fork" ? "spanish_fork" : pair.outflowBillTag.section === "bills_account" ? "bills_account" : "checking_account";
      outPayload[S.targetName] = pair.outflowBillTag.name;
    } else {
      outPayload[S.targetType] = "";
      outPayload[S.targetSection] = "";
      outPayload[S.targetName] = "";
    }
    const outOk = await patchStatement(pair.outStatementId, outPayload);
    const inOk = await patchStatement(pair.inStatementId, {
      [S.pairedStatementId]: pair.outStatementId,
      [S.transferFromAccount]: pair.fromAccount,
      [S.transferToAccount]: pair.toAccount,
      [S.goalId]: goalValue,
    });

    if (outOk || inOk) saved++;
    if (goalId) goalIdsToUpdate.add(goalId);

    if (pair.outflowBillTag && outDesc) {
      await upsertBillRule(outDesc, pair.outflowBillTag);
    }
  }

  for (const u of unpaired) {
    const goalId = u.goalId != null && String(u.goalId).trim() ? String(u.goalId).trim() : null;
    const desc = u.description?.trim() ?? "";

    const desired: Record<string, unknown> = { [S.goalId]: goalId ?? "" };
    if (u.fromAccount !== undefined) desired[S.transferFromAccount] = u.fromAccount ?? "";
    if (u.toAccount !== undefined) desired[S.transferToAccount] = u.toAccount ?? "";
    if (u.billTag) {
      desired[S.targetType] = u.billTag.listType === "subscriptions" ? "subscription" : "bill";
      desired[S.targetSection] = u.billTag.section === "spanish_fork" ? "spanish_fork" : u.billTag.section === "bills_account" ? "bills_account" : "checking_account";
      desired[S.targetName] = u.billTag.name;
    } else {
      desired[S.targetType] = "";
      desired[S.targetSection] = "";
      desired[S.targetName] = "";
    }

    const ok = await patchStatement(u.statementId, desired);
    if (ok) saved++;
    if (goalId) goalIdsToUpdate.add(goalId);

    if (u.billTag && desc) {
      await upsertBillRule(desc, u.billTag);
    }
  }

  for (const gid of goalIdsToUpdate) {
    await syncGoalFromStatements(gid, resolvedBase, authHeaders);
  }

  return NextResponse.json({
    ok: true,
    saved,
    message: `Saved ${saved} item${saved !== 1 ? "s" : ""}.`,
  });
}
