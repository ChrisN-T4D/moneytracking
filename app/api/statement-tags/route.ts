import { NextResponse } from "next/server";
import {
  getStatements,
  getStatementTagRules,
  getBillsWithMeta,
  getSpanishForkBills,
  getGoals,
  normalizeKeyForGrouping,
} from "@/lib/pocketbase";
import { getAdminToken } from "@/lib/pocketbase-setup";
import type {
  StatementRecord,
  StatementTagTargetType,
  BillListAccount,
  BillListType,
} from "@/lib/types";
import { suggestTagsForStatements, makeStatementPattern, matchRule } from "@/lib/statementTagging";
import { isTransferDescription } from "@/lib/statementsAnalysis";

const POCKETBASE_URL = process.env.NEXT_PUBLIC_POCKETBASE_URL ?? "";

function apiBase(): string {
  const url = POCKETBASE_URL.replace(/\/$/, "");
  if (url.endsWith("/_")) return url.replace(/\/_\/?$/, "") || url;
  return url;
}

const baseUrlForAuth = () =>
  (process.env.POCKETBASE_API_URL ?? process.env.NEXT_PUBLIC_POCKETBASE_URL ?? "").trim();

/** Fetch statements with goalId so goal-tagged items show in Add items to bills. Uses admin auth when configured so we get full records. */
async function getStatementsForTagging(): Promise<StatementRecord[]> {
  const url = baseUrlForAuth();
  const email = process.env.POCKETBASE_ADMIN_EMAIL ?? "";
  const password = process.env.POCKETBASE_ADMIN_PASSWORD ?? "";
  if (url && email && password) {
    try {
      const { token, baseUrl } = await getAdminToken(url, email, password);
      const apiBase = baseUrl.replace(/\/$/, "");
      const res = await fetch(
        `${apiBase}/api/collections/statements/records?perPage=500&sort=-date`,
        { headers: { Authorization: `Bearer ${token}` }, cache: "no-store" }
      );
      if (res.ok) {
        const data = (await res.json()) as {
          items?: Array<{
            id: string;
            date?: string;
            description?: string;
            amount?: number;
            balance?: number | null;
            category?: string | null;
            account?: string | null;
            sourceFile?: string | null;
            goalId?: string | null;
            goal_id?: string | null;
          }>;
        };
        return (data.items ?? []).map((item) => {
          const raw = item as Record<string, unknown>;
          const goalIdRaw = raw.goalId ?? raw.goal_id ?? null;
          const goalId = goalIdRaw != null && String(goalIdRaw).trim() !== "" ? String(goalIdRaw).trim() : null;
          return {
            id: item.id,
            date: item.date ?? "",
            description: item.description ?? "",
            amount: Number(item.amount) || 0,
            balance: item.balance != null ? Number(item.balance) : null,
            category: item.category ?? null,
            account: item.account ?? null,
            sourceFile: item.sourceFile ?? null,
            goalId,
          };
        });
      }
    } catch {
      // fall through to getStatements
    }
  }
  return getStatements({ perPage: 500, sort: "-date" });
}

/** Fetch bills; if 0 from public API and admin env set, retry with admin auth. */
async function getBillsForTagging() {
  let bills = await getBillsWithMeta();
  if (bills.length > 0) return bills;

  const url = baseUrlForAuth();
  const email = process.env.POCKETBASE_ADMIN_EMAIL ?? "";
  const password = process.env.POCKETBASE_ADMIN_PASSWORD ?? "";
  if (!url || !email || !password) return bills;

  try {
    const { token, baseUrl } = await getAdminToken(url, email, password);
    const apiBase = baseUrl.replace(/\/$/, "");
    const res = await fetch(
      `${apiBase}/api/collections/bills/records?perPage=500`,
      { headers: { Authorization: `Bearer ${token}` }, cache: "no-store" }
    );
    if (!res.ok) return bills;
    const data = (await res.json()) as {
      items?: Array<{
        id: string;
        name?: string;
        account?: string | null;
        listType?: string | null;
      }>;
    };
    bills = (data.items ?? []).map((item) => ({
      id: item.id,
      name: item.name ?? "",
      account: item.account ?? "",
      listType: item.listType ?? "",
    })) as Awaited<ReturnType<typeof getBillsWithMeta>>;
  } catch {
    // keep bills as []
  }
  return bills;
}

export const dynamic = "force-dynamic";

export async function GET() {
  if (!POCKETBASE_URL) {
    return NextResponse.json(
      { ok: false, message: "NEXT_PUBLIC_POCKETBASE_URL is not set." },
      { status: 400 }
    );
  }
  try {
    const [statements, rules, bills, spanishForkBills, goals] = await Promise.all([
      getStatementsForTagging(),
      getStatementTagRules(),
      getBillsForTagging(),
      getSpanishForkBills(),
      getGoals(),
    ]);

    // In PocketBase: name = subsection, so extract unique names (subsections) grouped by listType
    const subsectionsByType: { bills: string[]; subscriptions: string[] } = {
      bills: [],
      subscriptions: [],
    };
    // Also extract bill names (subsections) grouped by account+listType for the Name dropdown
    const billNamesByGroup: Record<string, string[]> = {};
    const seenBills = new Set<string>();
    const seenSubs = new Set<string>();
    
    console.log(
      `[statement-tags GET] Processing ${bills.length} bills - name field = subsection`
    );

    for (const bill of bills) {
      // In PocketBase structure: name IS the subsection
      const subsection = bill.name?.trim();

      if (!subsection) continue;

      // Normalise listType coming from PocketBase to "bills" / "subscriptions"
      const rawList = (bill.listType ?? "").toLowerCase();
      const listType: "bills" | "subscriptions" =
        rawList === "subscription" || rawList === "subscriptions"
          ? "subscriptions"
          : "bills";

      // Collect global subsections by listType (independent of account)
      if (listType === "subscriptions" && !seenSubs.has(subsection)) {
        subsectionsByType.subscriptions.push(subsection);
        seenSubs.add(subsection);
      } else if (listType === "bills" && !seenBills.has(subsection)) {
        subsectionsByType.bills.push(subsection);
        seenBills.add(subsection);
      }

      // Normalise account to our internal keys so it matches the UI's
      const rawAccount = (bill.account ?? "").toLowerCase();
      let accountKey: BillListAccount | null = null;
      if (rawAccount.includes("bill")) {
        accountKey = "bills_account";
      } else if (rawAccount.includes("check")) {
        accountKey = "checking_account";
      }

      // Also collect by (normalised) account+listType for Name dropdown
      if (accountKey) {
        const groupKey = `${accountKey}_${listType}`;
        if (!billNamesByGroup[groupKey]) {
          billNamesByGroup[groupKey] = [];
        }
        if (!billNamesByGroup[groupKey].includes(subsection)) {
          billNamesByGroup[groupKey].push(subsection);
        }
      }
    }

    // Checking-only subsection (Groceries & Gas); do not add to bills_account
    const defaultCheckingBillsSubsections = ["Groceries & Gas"];
    for (const name of defaultCheckingBillsSubsections) {
      if (!seenBills.has(name)) {
        subsectionsByType.bills.push(name);
        seenBills.add(name);
      }
      const groupKey = "checking_account_bills";
      if (!billNamesByGroup[groupKey]) billNamesByGroup[groupKey] = [];
      if (!billNamesByGroup[groupKey].includes(name)) billNamesByGroup[groupKey].push(name);
    }

    // Spanish Fork bills — populate a separate group so the tagging modal name dropdown shows the right options
    billNamesByGroup["spanish_fork"] = [];
    for (const sf of spanishForkBills) {
      const name = sf.name?.trim();
      if (name && !billNamesByGroup["spanish_fork"].includes(name)) {
        billNamesByGroup["spanish_fork"].push(name);
      }
    }
    billNamesByGroup["spanish_fork"].sort();

    subsectionsByType.bills.sort();
    subsectionsByType.subscriptions.sort();
    // Sort bill names (subsections) within each group
    for (const key in billNamesByGroup) {
      billNamesByGroup[key].sort();
    }

    console.log(
      `[statement-tags GET] Found subsections - bills: ${subsectionsByType.bills.length}, subscriptions: ${subsectionsByType.subscriptions.length}`
    );
    console.log(
      `[statement-tags GET] Subsections (bills):`,
      subsectionsByType.bills
    );
    console.log(
      `[statement-tags GET] Subsections (subscriptions):`,
      subsectionsByType.subscriptions
    );

    if (statements.length === 0) {
      const hasAdmin = Boolean(
        process.env.POCKETBASE_ADMIN_EMAIL && process.env.POCKETBASE_ADMIN_PASSWORD
      );
      return NextResponse.json({
        ok: true,
        items: [],
        subsections: { bills: [], subscriptions: [] },
        billNames: {},
        goals: goals.map((g) => ({ id: g.id, name: g.name })),
        message: hasAdmin
          ? "No statements found in PocketBase. Import some statements first using the upload form above."
          : "No statements found. Import some statements first. If statements exist but aren't showing, set POCKETBASE_ADMIN_EMAIL and POCKETBASE_ADMIN_PASSWORD in .env.local.",
      });
    }

    // Show statements that need review or that have a goal (so user can see and edit goal assignments):
    // - Exclude recurring transfer descriptions.
    // - Include statements that have a goalId so the user can see them and the goal dropdown is correct.
    // - Otherwise exclude if a non-ignore rule already matches (statement is "done").
    const needsReview = statements.filter((s) => {
      if (isTransferDescription(s.description ?? "")) return false;
      if (s.goalId) return true; // show statements linked to a goal so user can see and change them
      const matched = matchRule(rules, s);
      if (matched && matched.rule.targetType !== "ignore") return false; // Has a non-ignore rule → handled automatically
      return true;
    });

    // Generate heuristic suggestions for the remaining unreviewed statements
    const suggestions = suggestTagsForStatements(needsReview, rules);

    // In PocketBase: name = subsection, so targetName IS the subsection. Use statement.goalId when suggestion has none (so goal-linked items show current goal).
    const payload = suggestions.map((s) => ({
      id: s.statement.id,
      date: s.statement.date,
      description: s.statement.description,
      amount: s.statement.amount,
      suggestion: {
        targetType: s.targetType,
        targetSection: s.targetSection,
        targetName: s.targetName,
        goalId: s.goalId ?? s.statement.goalId ?? null,
        confidence: s.confidence ?? "LOW",
        matchType: s.matchType ?? "heuristic",
        hasMatchedRule: false,
      },
    }));

    console.log(`[statement-tags GET] Returning ${payload.length} suggestions`);
    return NextResponse.json({
      ok: true,
      items: payload,
      subsections: subsectionsByType,
      billNames: billNamesByGroup,
      goals: goals.map((g) => ({ id: g.id, name: g.name })),
    });
  } catch (e) {
    console.error("GET /api/statement-tags error:", e);
    return NextResponse.json(
      { ok: false, message: e instanceof Error ? e.message : String(e) },
      { status: 500 }
    );
  }
}

interface IncomingTagItem {
  statementId: string;
  /** Description text from the statement (sent by client to avoid needing server re-fetch). */
  description?: string;
  /** Amount from the statement (sent by client to avoid needing server re-fetch). */
  amount?: number;
  pattern?: string;
  targetType: StatementTagTargetType;
  targetSection?: BillListAccount | "spanish_fork" | null;
  targetName?: string; // In PocketBase: name = subsection, so this IS the subsection
  goalId?: string | null;
  /** If this tag was auto-suggested and user changed it, mark as override. */
  wasAutoTagged?: boolean;
  /** Original suggestion if user overrode it. */
  originalSuggestion?: {
    targetType?: StatementTagTargetType;
    targetSection?: BillListAccount | "spanish_fork" | null;
    targetName?: string;
  };
}

export async function POST(request: Request) {
  if (!POCKETBASE_URL) {
    return NextResponse.json(
      { ok: false, message: "NEXT_PUBLIC_POCKETBASE_URL is not set." },
      { status: 400 }
    );
  }
  const base = apiBase();
  try {
    const body = (await request.json()) as { items?: IncomingTagItem[] };
    const items = Array.isArray(body.items) ? body.items : [];
    if (items.length === 0) {
      return NextResponse.json(
        { ok: false, message: "No tagging items provided." },
        { status: 400 }
      );
    }

    // Build a lookup from any server-fetched statements (best-effort fallback).
    // Client now sends description+amount directly so this is only needed for goalId patching.
    let stmtById = new Map<string, StatementRecord>();
    try {
      // Try normal fetch first, then admin auth fallback
      let statements = await getStatements({ perPage: 1000, sort: "-date" });
      if (statements.length === 0) {
        const url = baseUrlForAuth();
        const email = process.env.POCKETBASE_ADMIN_EMAIL ?? "";
        const password = process.env.POCKETBASE_ADMIN_PASSWORD ?? "";
        if (url && email && password) {
          const { token, baseUrl: resolvedBase } = await getAdminToken(url, email, password);
          const adminApiBase = resolvedBase.replace(/\/$/, "");
          const res = await fetch(
            `${adminApiBase}/api/collections/statements/records?perPage=1000&sort=-date`,
            { headers: { Authorization: `Bearer ${token}` }, cache: "no-store" }
          );
          if (res.ok) {
            const data = (await res.json()) as { items?: Array<{ id: string; date?: string; description?: string; amount?: number; balance?: number | null; category?: string | null; account?: string | null; sourceFile?: string | null; goalId?: string | null; goal_id?: string | null }> };
            statements = (data.items ?? []).map((item) => {
              const raw = item as Record<string, unknown>;
              const gid = raw.goalId ?? raw.goal_id;
              const goalId = gid != null && String(gid).trim() !== "" ? String(gid).trim() : null;
              return {
                id: item.id,
                date: item.date ?? "",
                description: item.description ?? "",
                amount: Number(item.amount) || 0,
                balance: item.balance != null ? Number(item.balance) : null,
                category: item.category ?? null,
                account: item.account ?? null,
                sourceFile: item.sourceFile ?? null,
                goalId,
              };
            });
          }
        }
      }
      stmtById = new Map(statements.map((s) => [s.id, s]));
    } catch {
      // proceed with empty map; client-supplied description/amount will be used
    }

    // Build sets of existing subsection keys (normalized) so we only create a new bill when one doesn't exist.
    const existingBillsKeys = new Set<string>();
    const existingSfKeys = new Set<string>();
    try {
      const [existingBills, existingSf] = await Promise.all([
        getBillsForTagging(),
        getSpanishForkBills(),
      ]);
      for (const b of existingBills) {
        const name = b.name?.trim();
        if (!name) continue;
        const rawAccount = (b.account ?? "").toLowerCase();
        const accountKey =
          rawAccount.includes("bill") ? "bills_account"
          : rawAccount.includes("check") ? "checking_account"
          : null;
        if (!accountKey) continue;
        const rawList = (b.listType ?? "").toLowerCase();
        const listType: "bills" | "subscriptions" =
          rawList === "subscription" || rawList === "subscriptions" ? "subscriptions" : "bills";
        existingBillsKeys.add(`${accountKey}_${listType}_${normalizeKeyForGrouping(name)}`);
      }
      for (const s of existingSf) {
        const name = s.name?.trim();
        if (name) existingSfKeys.add(normalizeKeyForGrouping(name));
      }
    } catch (e) {
      console.warn("[statement-tags POST] Could not load existing bills for dedup:", e);
    }

    let rulesCreated = 0;
    let billsUpserted = 0;
    const affectedGoalIds = new Set<string>();
    console.log(`[statement-tags POST] Processing ${items.length} item(s). stmtById size: ${stmtById.size}`);

    // Resolve admin auth for statement PATCH (goalId), goal currentAmount updates, and rule upserts
    let statementPatchBase = base;
    let statementPatchHeaders: Record<string, string> = { "Content-Type": "application/json" };
    try {
      const url = baseUrlForAuth();
      const email = process.env.POCKETBASE_ADMIN_EMAIL ?? "";
      const password = process.env.POCKETBASE_ADMIN_PASSWORD ?? "";
      if (url && email && password) {
        const { token, baseUrl: resolvedBase } = await getAdminToken(url, email, password);
        statementPatchBase = resolvedBase.replace(/\/$/, "");
        statementPatchHeaders = { "Content-Type": "application/json", Authorization: `Bearer ${token}` };
      }
    } catch {
      // proceed with public base
    }

    for (const item of items) {
      // Use client-supplied description/amount first, fall back to server-fetched statement
      const serverStmt = stmtById.get(item.statementId);
      const description = item.description?.trim() || serverStmt?.description || "";
      const amount = item.amount ?? serverStmt?.amount ?? 0;

      // We need at least a description to build a meaningful pattern; skip if totally empty
      if (!description && !item.pattern) {
        console.warn(`[statement-tags POST] Skipping item ${item.statementId} — no description or pattern.`);
        continue;
      }

      const pattern = (item.pattern && item.pattern.trim()) || makeStatementPattern(description);
      const targetType = item.targetType;
      const targetSection = item.targetSection ?? null;
      const goalId = item.goalId && item.goalId.trim() ? item.goalId.trim() : null;
      // In PocketBase: name = subsection, so targetName is the subsection/name
      const targetName =
        (item.targetName && item.targetName.trim()) ||
        description.slice(0, 40) ||
        "Item";

      // Track which goals need currentAmount recalc (old and new)
      const prevGoalId = serverStmt?.goalId && serverStmt.goalId.trim() ? serverStmt.goalId.trim() : null;
      if (prevGoalId) affectedGoalIds.add(prevGoalId);
      if (goalId) affectedGoalIds.add(goalId);

      // Save goalId to statement record (always PATCH so we can clear goal when user selects "No goal")
      try {
        const patchRes = await fetch(
          `${statementPatchBase}/api/collections/statements/records/${item.statementId}`,
          {
            method: "PATCH",
            headers: statementPatchHeaders,
            body: JSON.stringify({ goalId }),
          }
        );
        if (!patchRes.ok) {
          const errText = await patchRes.text();
          console.error(`Failed to save goalId to statement ${item.statementId}: ${patchRes.status} ${errText}`);
        }
      } catch (err) {
        console.error(`Failed to save goalId to statement ${item.statementId}:`, err);
      }

      // Upsert rule: match on pattern only for now.
      const existingRulesRes = await fetch(
        `${base}/api/collections/statement_tag_rules/records?perPage=1&filter=${encodeURIComponent(
          `pattern="${pattern}"`
        )}`,
        { cache: "no-store" }
      );

      let ruleId: string | null = null;
      let existingRule: { useCount?: number; overrideCount?: number } | null = null;
      if (existingRulesRes.ok) {
        const data = (await existingRulesRes.json()) as {
          items?: Array<{ id: string; useCount?: number; overrideCount?: number }>;
        };
        const existing = data.items?.[0];
        ruleId = existing?.id ?? null;
        existingRule = existing ?? null;
      }

      // Check if user overrode an auto-tagged suggestion
      const wasOverride = item.wasAutoTagged && 
        item.originalSuggestion &&
        (item.originalSuggestion.targetType !== targetType ||
         item.originalSuggestion.targetSection !== targetSection ||
         item.originalSuggestion.targetName !== targetName);

      // Update usage statistics
      const currentUseCount = existingRule?.useCount ?? 0;
      const currentOverrideCount = existingRule?.overrideCount ?? 0;
      const newUseCount = wasOverride ? currentUseCount : currentUseCount + 1;
      const newOverrideCount = wasOverride ? currentOverrideCount + 1 : currentOverrideCount;

      // Note: subsection is not stored separately - name IS the subsection in PocketBase
      const rulePayload = {
        pattern,
        normalizedDescription: targetName,
        targetType,
        targetSection,
        targetName, // This is the subsection/name
        goalId: goalId ?? null,
        useCount: newUseCount,
        overrideCount: newOverrideCount,
      };

      let ruleSaveOk = false;
      if (ruleId) {
        const res = await fetch(
          `${base}/api/collections/statement_tag_rules/records/${ruleId}`,
          {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(rulePayload),
          }
        );
        ruleSaveOk = res.ok;
      } else {
        // New rule - initialize with useCount=1 if not an override
        const newRulePayload = {
          ...rulePayload,
          useCount: wasOverride ? 0 : 1,
          overrideCount: wasOverride ? 1 : 0,
        };
        const res = await fetch(
          `${base}/api/collections/statement_tag_rules/records`,
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(newRulePayload),
          }
        );
        ruleSaveOk = res.ok;
      }
      if (ruleSaveOk) rulesCreated++;

      // If this is a bill-like tag, create a new bill subsection only when one doesn't already exist.
      if (
        (targetType === "bill" ||
          targetType === "subscription" ||
          targetType === "spanish_fork") &&
        targetSection
      ) {
        const billAmount = Math.abs(amount);
        const normalizedName = normalizeKeyForGrouping(targetName);

        if (targetSection === "spanish_fork") {
          if (!existingSfKeys.has(normalizedName)) {
            const sfPayload = {
              name: targetName, // name IS the subsection
              frequency: "monthly",
              nextDue: new Date().toISOString().slice(0, 10),
              inThisPaycheck: false,
              amount: billAmount,
              tenantPaid: false,
            };
            const res = await fetch(
              `${base}/api/collections/spanish_fork_bills/records`,
              {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(sfPayload),
              }
            );
            if (res.ok) {
              billsUpserted++;
              existingSfKeys.add(normalizedName);
            }
          }
        } else {
          const account: BillListAccount = targetSection;
          const listType: BillListType =
            targetType === "subscription" ? "subscriptions" : "bills";
          const billKey = `${account}_${listType}_${normalizedName}`;
          if (!existingBillsKeys.has(billKey)) {
            const billPayload = {
              name: targetName, // name IS the subsection
              frequency: "monthly",
              nextDue: new Date().toISOString().slice(0, 10),
              inThisPaycheck: false,
              amount: billAmount,
              account,
              listType,
            };
            const res = await fetch(
              `${base}/api/collections/bills/records`,
              {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(billPayload),
              }
            );
            if (res.ok) {
              billsUpserted++;
              existingBillsKeys.add(billKey);
            }
          }
        }
      }
    }

    // Recalculate currentAmount for each affected goal: sum |amount| of all statements tagged to that goal (negative = payment toward goal → increases currentAmount)
    if (affectedGoalIds.size > 0 && statementPatchHeaders.Authorization) {
      const adminBase = statementPatchBase;
      for (const gid of affectedGoalIds) {
        try {
          let total = 0;
          let page = 1;
          const perPage = 500;
          while (true) {
            const filter = encodeURIComponent(`goalId="${gid}"`);
            const res = await fetch(
              `${adminBase}/api/collections/statements/records?filter=${filter}&perPage=${perPage}&page=${page}&sort=-date`,
              { cache: "no-store", headers: statementPatchHeaders }
            );
            if (!res.ok) break;
            const data = (await res.json()) as { items?: Array<{ amount?: number }>; totalItems?: number };
            const items = data.items ?? [];
            for (const row of items) {
              total += Math.abs(Number(row.amount) || 0);
            }
            const totalItems = data.totalItems ?? 0;
            if (page * perPage >= totalItems || items.length === 0) break;
            page++;
          }
          const patchGoalRes = await fetch(
            `${adminBase}/api/collections/goals/records/${gid}`,
            {
              method: "PATCH",
              headers: statementPatchHeaders,
              body: JSON.stringify({ currentAmount: total }),
            }
          );
          if (!patchGoalRes.ok) {
            console.error(`Failed to update goal ${gid} currentAmount: ${patchGoalRes.status}`);
          }
        } catch (err) {
          console.error(`Error recalculating goal ${gid} currentAmount:`, err);
        }
      }
    }

    console.log(`[statement-tags POST] Done. rulesCreated=${rulesCreated} billsUpserted=${billsUpserted}`);
    return NextResponse.json({
      ok: true,
      rulesCreated,
      billsUpserted,
      message: `Saved ${rulesCreated} rules and upserted ${billsUpserted} bills.`,
    });
  } catch (e) {
    return NextResponse.json(
      { ok: false, message: e instanceof Error ? e.message : String(e) },
      { status: 500 }
    );
  }
}

