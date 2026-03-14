import { NextResponse } from "next/server";
import { getAdminToken } from "@/lib/pocketbase-setup";
import { makeStatementPattern } from "@/lib/statementTagging";

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

/**
 * POST /api/transfer-pairs — Save transfer pairings and unpaired transfer metadata.
 *
 * PATCHes statement records with available fields, retrying with fewer fields on 400.
 * Goals are also saved via statement_tag_rules as a fallback.
 * After saving, recalculates goal currentAmount from matching statements.
 */
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
  const warnings: string[] = [];
  const authHeaders = { "Content-Type": "application/json", Authorization: `Bearer ${token}` };

  // Discover actual PocketBase field names (handles typos / casing differences in the schema)
  const fieldNameMap: Record<string, string> = {
    goalId: "goalId",
    pairedStatementId: "pairedStatementId",
    transferFromAccount: "transferFromAccount",
    transferToAccount: "transferToAccount",
    targetType: "targetType",
    targetSection: "targetSection",
    targetName: "targetName",
  };
  try {
    const colRes = await fetch(`${resolvedBase}/api/collections/statements`, {
      headers: { Authorization: `Bearer ${token}` }, cache: "no-store",
    });
    if (colRes.ok) {
      const colData = (await colRes.json()) as Record<string, unknown>;
      const fieldsArr = ((colData.fields ?? colData.schema ?? []) as { name?: string }[]).map((f) => f.name ?? "");
      const schemaFields = new Set(fieldsArr);
      console.log(`[transfer-pairs] Statements schema fields: ${fieldsArr.join(", ")}`);

      // Map our desired field names to actual schema field names (case-insensitive + typo matching)
      for (const desired of Object.keys(fieldNameMap)) {
        if (schemaFields.has(desired)) continue;
        const lower = desired.toLowerCase();
        const match = fieldsArr.find((f) =>
          f.toLowerCase() === lower ||
          f.toLowerCase().replace(/[^a-z]/g, "") === lower.replace(/[^a-z]/g, "")
        );
        if (match) {
          fieldNameMap[desired] = match;
          console.log(`[transfer-pairs] Field mapping: ${desired} → ${match}`);
        }
      }

      // Also check for common typos: "trasnfer" instead of "transfer"
      for (const desired of ["transferFromAccount", "transferToAccount"]) {
        if (schemaFields.has(fieldNameMap[desired])) continue;
        const typoVariants = fieldsArr.filter((f) =>
          f.toLowerCase().includes("from") && desired.includes("From") ||
          f.toLowerCase().includes("to") && desired.includes("To") && f.toLowerCase().includes("account")
        );
        if (typoVariants.length === 1) {
          fieldNameMap[desired] = typoVariants[0];
          console.log(`[transfer-pairs] Field mapping (typo): ${desired} → ${typoVariants[0]}`);
        }
      }
    }
  } catch { /* proceed with default names */ }

  // Discover statement_tag_rules field names (PocketBase may use lowercase/snake_case)
  const ruleFieldMap: Record<string, string> = {
    pattern: "pattern",
    normalizedDescription: "normalizedDescription",
    targetType: "targetType",
    targetSection: "targetSection",
    targetName: "targetName",
    goalId: "goalId",
    useCount: "useCount",
    overrideCount: "overrideCount",
  };
  try {
    const ruleColRes = await fetch(`${resolvedBase}/api/collections/statement_tag_rules`, {
      headers: { Authorization: `Bearer ${token}` }, cache: "no-store",
    });
    if (ruleColRes.ok) {
      const ruleColData = (await ruleColRes.json()) as Record<string, unknown>;
      const ruleFields = ((ruleColData.fields ?? ruleColData.schema ?? []) as { name?: string }[]).map((f) => f.name ?? "");
      const ruleSet = new Set(ruleFields);
      for (const desired of Object.keys(ruleFieldMap)) {
        if (ruleSet.has(desired)) continue;
        const lower = desired.replace(/([A-Z])/g, "_$1").toLowerCase().replace(/^_/, "");
        const match = ruleFields.find((f) => f.toLowerCase() === lower || f === lower.replace(/_/g, ""));
        if (match) {
          ruleFieldMap[desired] = match;
          console.log(`[transfer-pairs] Rule field mapping: ${desired} → ${match}`);
        }
      }
    }
  } catch { /* proceed with defaults */ }

  function remapRulePayload(desired: Record<string, unknown>): Record<string, unknown> {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(desired)) {
      const actual = ruleFieldMap[k] ?? k;
      out[actual] = v;
    }
    return out;
  }

  /** Remap field names to match actual PocketBase schema, dropping fields that don't exist. */
  function remapFields(desired: Record<string, unknown>): Record<string, unknown> {
    const result: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(desired)) {
      const actual = fieldNameMap[k] ?? k;
      result[actual] = v;
    }
    return result;
  }

  async function patchStatement(statementId: string, desired: Record<string, unknown>): Promise<boolean> {
    const patchUrl = `${resolvedBase}/api/collections/statements/records/${statementId}`;
    const remapped = remapFields(desired);

    const res = await fetch(patchUrl, {
      method: "PATCH", headers: authHeaders,
      body: JSON.stringify(remapped),
    });
    if (res.ok) return true;

    if (res.status !== 400) {
      console.warn(`[transfer-pairs] PATCH ${statementId}: ${res.status}`);
      return false;
    }

    // 400 — some fields may not exist; try with just goalId
    const goalKey = fieldNameMap["goalId"];
    if (remapped[goalKey] !== undefined) {
      const res2 = await fetch(patchUrl, {
        method: "PATCH", headers: authHeaders,
        body: JSON.stringify({ [goalKey]: remapped[goalKey] }),
      });
      if (res2.ok) return true;
      console.warn(`[transfer-pairs] PATCH ${statementId} ${goalKey}-only also failed: ${res2.status}`);
    }

    return false;
  }

  /** Upsert a statement_tag_rule by pattern. Returns true if saved, false otherwise. */
  async function upsertRule(description: string, rulePayload: Record<string, unknown>): Promise<boolean> {
    const pattern = makeStatementPattern(description);
    if (!pattern) {
      console.warn("[transfer-pairs] makeStatementPattern returned empty for:", description?.slice(0, 50));
      return false;
    }
    const fullPayload = { pattern, ...rulePayload };
    try {
      // PocketBase filter expects double-quoted strings; escape backslash and quote inside pattern
      const escaped = pattern.replace(/\\/g, "\\\\").replace(/"/g, '\\"');
      const filter = encodeURIComponent(`pattern="${escaped}"`);
      const listRes = await fetch(
        `${resolvedBase}/api/collections/statement_tag_rules/records?perPage=1&filter=${filter}`,
        { headers: { Authorization: `Bearer ${token}` }, cache: "no-store" }
      );
      if (!listRes.ok) {
        console.warn("[transfer-pairs] list rules failed:", listRes.status);
        return false;
      }
      const listData = (await listRes.json()) as { items?: { id: string }[] };
      const existing = listData.items?.[0];
      if (existing) {
        const body = remapRulePayload(fullPayload);
        const res = await fetch(`${resolvedBase}/api/collections/statement_tag_rules/records/${existing.id}`, {
          method: "PATCH", headers: authHeaders, body: JSON.stringify(body),
        });
        if (!res.ok) {
          const err = await res.text();
          console.error("[transfer-pairs] PATCH rule failed:", res.status, err);
          return false;
        }
        return true;
      } else {
        const body = remapRulePayload(fullPayload);
        const res = await fetch(`${resolvedBase}/api/collections/statement_tag_rules/records`, {
          method: "POST", headers: authHeaders, body: JSON.stringify(body),
        });
        if (!res.ok) {
          const err = await res.text();
          console.error("[transfer-pairs] POST rule failed:", res.status, err);
          return false;
        }
        return true;
      }
    } catch (e) {
      console.error("[transfer-pairs] upsertRule error:", e);
      return false;
    }
  }

  async function upsertBillRule(description: string, tag: BillTagPayload): Promise<boolean> {
    const targetType = tag.listType === "subscriptions" ? "subscription" : "bill";
    const targetSection = tag.section === "spanish_fork" ? "spanish_fork" : tag.section === "bills_account" ? "bills_account" : "checking_account";
    const payload: Record<string, unknown> = {
      normalizedDescription: tag.name,
      targetType,
      targetSection,
      targetName: tag.name,
      goalId: null,
    };
    let ok = await upsertRule(description, payload);
    if (!ok) {
      const withCounts = { ...payload, useCount: 1, overrideCount: 0 };
      ok = await upsertRule(description, withCounts);
    }
    return ok;
  }

  /** Clean up any overly-broad "transfer" rules that were incorrectly created for goal assignments. */
  async function cleanupBroadGoalRules(): Promise<void> {
    try {
      const filter = encodeURIComponent(`targetType="transfer"`);
      const res = await fetch(
        `${resolvedBase}/api/collections/statement_tag_rules/records?perPage=200&filter=${filter}`,
        { headers: { Authorization: `Bearer ${token}` }, cache: "no-store" }
      );
      if (!res.ok) return;
      const data = (await res.json()) as { items?: { id: string; pattern?: string; goalId?: string }[] };
      for (const rule of data.items ?? []) {
        await fetch(`${resolvedBase}/api/collections/statement_tag_rules/records/${rule.id}`, {
          method: "DELETE", headers: { Authorization: `Bearer ${token}` },
        });
      }
      if ((data.items?.length ?? 0) > 0) {
        console.log(`[transfer-pairs] Cleaned up ${data.items!.length} broad transfer goal rules`);
      }
    } catch { /* best effort */ }
  }

  /** Recalculate goal currentAmount from all statements that reference this goal. */
  async function updateGoalAmount(goalId: string): Promise<void> {
    try {
      const goalKey = fieldNameMap["goalId"];
      let filter = encodeURIComponent(`${goalKey}="${goalId}"`);
      let res = await fetch(
        `${resolvedBase}/api/collections/statements/records?filter=${filter}&perPage=500&fields=amount`,
        { headers: { Authorization: `Bearer ${token}` } }
      );
      if (!res.ok && goalKey !== "goalId") {
        filter = encodeURIComponent(`goalId="${goalId}"`);
        res = await fetch(
          `${resolvedBase}/api/collections/statements/records?filter=${filter}&perPage=500&fields=amount`,
          { headers: { Authorization: `Bearer ${token}` } }
        );
      }
      if (!res.ok) {
        console.warn(`[transfer-pairs] Could not query statements for goal ${goalId}: ${res.status}`);
        return;
      }
      const data = (await res.json()) as { items?: { amount?: number }[] };
      const total = (data.items ?? []).reduce((s, r) => s + Math.abs(r.amount ?? 0), 0);
      await fetch(`${resolvedBase}/api/collections/goals/records/${goalId}`, {
        method: "PATCH", headers: authHeaders,
        body: JSON.stringify({ currentAmount: total }),
      });
    } catch (e) {
      console.error(`[transfer-pairs] Failed to update goal ${goalId} currentAmount:`, e);
    }
  }

  // Clean up any broad transfer rules that were incorrectly created for goal assignments
  await cleanupBroadGoalRules();

  const goalIdsToUpdate = new Set<string>();

  // --- Process pairs ---
  for (const pair of pairs) {
    const goalId = pair.goalId?.trim() || null;
    const goalValue = goalId ?? "";
    const outDesc = pair.outflowDescription?.trim() ?? "";

    const outPayload: Record<string, unknown> = {
      pairedStatementId: pair.inStatementId,
      transferFromAccount: pair.fromAccount,
      transferToAccount: pair.toAccount,
      goalId: goalValue,
    };
    if (pair.outflowBillTag) {
      outPayload.targetType = pair.outflowBillTag.listType === "subscriptions" ? "subscription" : "bill";
      outPayload.targetSection = pair.outflowBillTag.section === "spanish_fork" ? "spanish_fork" : pair.outflowBillTag.section === "bills_account" ? "bills_account" : "checking_account";
      outPayload.targetName = pair.outflowBillTag.name;
    } else {
      outPayload.targetType = "";
      outPayload.targetSection = "";
      outPayload.targetName = "";
    }
    const outOk = await patchStatement(pair.outStatementId, outPayload);
    const inOk = await patchStatement(pair.inStatementId, {
      pairedStatementId: pair.outStatementId,
      transferFromAccount: pair.fromAccount,
      transferToAccount: pair.toAccount,
      goalId: goalValue,
    });

    if (outOk || inOk) saved++;
    if (goalId) goalIdsToUpdate.add(goalId);

    if (pair.outflowBillTag && outDesc) {
      await upsertBillRule(outDesc, pair.outflowBillTag);
    }
  }

  // --- Process unpaired ---
  for (const u of unpaired) {
    const goalId = u.goalId != null && String(u.goalId).trim() ? String(u.goalId).trim() : null;
    const desc = u.description?.trim() ?? "";

    const desired: Record<string, unknown> = { goalId: goalId ?? "" };
    if (u.fromAccount !== undefined) desired.transferFromAccount = u.fromAccount ?? "";
    if (u.toAccount !== undefined) desired.transferToAccount = u.toAccount ?? "";
    if (u.billTag) {
      desired.targetType = u.billTag.listType === "subscriptions" ? "subscription" : "bill";
      desired.targetSection = u.billTag.section === "spanish_fork" ? "spanish_fork" : u.billTag.section === "bills_account" ? "bills_account" : "checking_account";
      desired.targetName = u.billTag.name;
    } else {
      desired.targetType = "";
      desired.targetSection = "";
      desired.targetName = "";
    }

    const ok = await patchStatement(u.statementId, desired);
    if (ok) saved++;
    if (goalId) goalIdsToUpdate.add(goalId);

    if (u.billTag && desc) {
      await upsertBillRule(desc, u.billTag);
    }
  }

  // --- Recalculate goal amounts ---
  for (const gid of goalIdsToUpdate) {
    await updateGoalAmount(gid);
  }

  const message = warnings.length > 0
    ? `Saved ${saved} item${saved !== 1 ? "s" : ""}. ${warnings.join(" ")}`
    : `Saved ${saved} item${saved !== 1 ? "s" : ""}.`;

  return NextResponse.json({ ok: true, saved, message, warnings });
}
