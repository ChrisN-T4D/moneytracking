import { NextResponse } from "next/server";
import {
  getStatements,
  getStatementTagRules,
  getBillsWithMeta,
  getSpanishForkBills,
  getGoals,
  getAutoTransfers,
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
import { findTransferPairs, isTransferDescription } from "@/lib/statementsAnalysis";
import { PB } from "@/lib/pbFieldMap";
import { syncGoalFromStatements } from "@/lib/recalculateGoalFromStatements";

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
        const data = (await res.json()) as { items?: Array<Record<string, unknown>> };
        return (data.items ?? []).map((raw) => {
          const str = (key: string) => {
            const v = raw[key];
            return v != null && String(v).trim() !== "" ? String(v).trim() : null;
          };
          return {
            id: String(raw.id ?? ""),
            date: String(raw.date ?? ""),
            description: String(raw.description ?? ""),
            amount: Number(raw.amount) || 0,
            balance: raw.balance != null ? Number(raw.balance) : null,
            category: str("category"),
            account: str("account"),
            sourceFile: str(PB.statements.sourceFile),
            goalId: str(PB.statements.goalId),
            pairedStatementId: str(PB.statements.pairedStatementId),
            transferFromAccount: str(PB.statements.transferFromAccount),
            transferToAccount: str(PB.statements.transferToAccount),
            targetType: str(PB.statements.targetType) as StatementTagTargetType | null,
            targetSection: str(PB.statements.targetSection) as StatementRecord["targetSection"],
            targetName: str(PB.statements.targetName),
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

export async function GET(request: Request) {
  const reqUrl = new URL(request.url);
  const transfersOnly = reqUrl.searchParams.get("transfersOnly") === "true";
  if (!POCKETBASE_URL) {
    return NextResponse.json(
      { ok: false, message: "NEXT_PUBLIC_POCKETBASE_URL is not set." },
      { status: 400 }
    );
  }
  try {
    const [statements, rules, bills, spanishForkBills, goals, autoTransfers] = await Promise.all([
      getStatementsForTagging(),
      getStatementTagRules(),
      getBillsForTagging(),
      getSpanishForkBills(),
      getGoals(),
      getAutoTransfers(),
    ]);

    const subsectionsByType: { bills: string[]; subscriptions: string[] } = {
      bills: [],
      subscriptions: [],
    };
    // Also extract bill names (subsections) grouped by account+listType for the Name dropdown
    const billNamesByGroup: Record<string, string[]> = {};
    const seenBills = new Set<string>();
    const seenSubs = new Set<string>();

    for (const bill of bills) {
      const subsection = bill.name?.trim();

      if (!subsection) continue;

      const rawList = (bill.listType ?? "").toLowerCase();
      const listType: "bills" | "subscriptions" =
        rawList === "subscription" || rawList === "subscriptions"
          ? "subscriptions"
          : "bills";

      if (listType === "subscriptions" && !seenSubs.has(subsection)) {
        subsectionsByType.subscriptions.push(subsection);
        seenSubs.add(subsection);
      } else if (listType === "bills" && !seenBills.has(subsection)) {
        subsectionsByType.bills.push(subsection);
        seenBills.add(subsection);
      }

      const rawAccount = (bill.account ?? "").toLowerCase();
      let accountKey: BillListAccount | null = null;
      if (rawAccount.includes("bill")) {
        accountKey = "bills_account";
      } else if (rawAccount.includes("check")) {
        accountKey = "checking_account";
      }

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
    for (const key in billNamesByGroup) {
      billNamesByGroup[key].sort();
    }

    if (transfersOnly) {
      const transferStatements = statements.filter((s) => isTransferDescription(s.description ?? ""));
      const { pairMap } = findTransferPairs(statements);
      const transferItems = transferStatements.map((s) => {
        const matched = matchRule(rules, s);
        const suggestedGoalId = matched?.rule?.goalId && String(matched.rule.goalId).trim() ? String(matched.rule.goalId).trim() : null;
        const pairedId = s.pairedStatementId ?? pairMap.get(s.id) ?? null;
        return {
          id: s.id,
          date: s.date,
          description: s.description,
          amount: s.amount,
          account: s.account ?? null,
          pairedStatementId: pairedId,
          goalId: s.goalId ?? null,
          suggestedGoalId: suggestedGoalId ?? undefined,
          transferFromAccount: s.transferFromAccount ?? null,
          transferToAccount: s.transferToAccount ?? null,
          targetType: s.targetType ?? null,
          targetSection: s.targetSection ?? null,
          targetName: s.targetName ?? null,
        };
      });
      const billOptions: { section: string; listType: "bills" | "subscriptions"; name: string }[] = [];
      for (const bill of bills) {
        const name = bill.name?.trim();
        if (!name) continue;
        const rawList = (bill.listType ?? "").toLowerCase();
        const listType: "bills" | "subscriptions" =
          rawList === "subscription" || rawList === "subscriptions" ? "subscriptions" : "bills";
        const rawAccount = (bill.account ?? "").toLowerCase();
        const section = rawAccount.includes("bill") ? "bills_account" : "checking_account";
        if (!billOptions.some((b) => b.section === section && b.listType === listType && b.name === name)) {
          billOptions.push({ section, listType, name });
        }
      }
      for (const sf of spanishForkBills) {
        const name = sf.name?.trim();
        if (name && !billOptions.some((b) => b.section === "spanish_fork" && b.name === name)) {
          billOptions.push({ section: "spanish_fork", listType: "bills", name });
        }
      }
      billOptions.sort((a, b) => a.name.localeCompare(b.name));
      return NextResponse.json({
        ok: true,
        items: transferItems,
        goals: goals.map((g) => ({ id: g.id, name: g.name })),
        billOptions,
      });
    }

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
        autoTransfers: autoTransfers.map((t) => ({ id: t.id, whatFor: t.whatFor ?? "" })),
        message: hasAdmin
          ? "No statements found in PocketBase. Import some statements first using the upload form above."
          : "No statements found. Import some statements first. If statements exist but aren't showing, set POCKETBASE_ADMIN_EMAIL and POCKETBASE_ADMIN_PASSWORD in .env.local.",
      });
    }

    const nonTransferStatements = statements.filter((s) => !isTransferDescription(s.description ?? ""));

    const needsReview: typeof statements = [];
    const alreadyTagged: typeof statements = [];
    for (const s of nonTransferStatements) {
      const matched = matchRule(rules, s);
      if (matched && matched.rule.targetType !== "ignore") {
        alreadyTagged.push(s);
      } else {
        needsReview.push(s);
      }
    }

    const suggestions = suggestTagsForStatements(needsReview, rules);
    const taggedSuggestions = suggestTagsForStatements(alreadyTagged, rules);

    const { pairMap, primaryIds } = findTransferPairs(statements);

    const payload = [
      ...suggestions.map((s) => {
        const stId = s.statement.id;
        return {
          id: stId,
          date: s.statement.date,
          description: s.statement.description,
          amount: s.statement.amount,
          pairedStatementId: pairMap.get(stId) ?? undefined,
          isTransferPairPrimary: primaryIds.has(stId),
          suggestion: {
            targetType: s.targetType,
            targetSection: s.targetSection,
            targetName: s.targetName,
            goalId: s.goalId ?? s.statement.goalId ?? null,
            confidence: s.confidence ?? "LOW",
            matchType: s.matchType ?? "heuristic",
            hasMatchedRule: false,
          },
        };
      }),
      ...taggedSuggestions.map((s) => {
        const stId = s.statement.id;
        return {
          id: stId,
          date: s.statement.date,
          description: s.statement.description,
          amount: s.statement.amount,
          pairedStatementId: pairMap.get(stId) ?? undefined,
          isTransferPairPrimary: primaryIds.has(stId),
          suggestion: {
            targetType: s.targetType,
            targetSection: s.targetSection,
            targetName: s.targetName,
            goalId: s.goalId ?? s.statement.goalId ?? null,
            confidence: s.confidence ?? "HIGH",
            matchType: s.matchType ?? "exact_pattern",
            hasMatchedRule: true,
          },
        };
      }),
    ];

    return NextResponse.json({
      ok: true,
      items: payload,
      subsections: subsectionsByType,
      billNames: billNamesByGroup,
      goals: goals.map((g) => ({ id: g.id, name: g.name })),
      autoTransfers: autoTransfers.map((t) => ({ id: t.id, whatFor: t.whatFor ?? "" })),
    });
  } catch (e) {
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
  targetName?: string;
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
            const data = (await res.json()) as { items?: Array<Record<string, unknown>> };
            statements = (data.items ?? []).map((raw) => {
              const str = (key: string) => {
                const v = raw[key];
                return v != null && String(v).trim() !== "" ? String(v).trim() : null;
              };
              return {
                id: String(raw.id ?? ""),
                date: String(raw.date ?? ""),
                description: String(raw.description ?? ""),
                amount: Number(raw.amount) || 0,
                balance: raw.balance != null ? Number(raw.balance) : null,
                category: str("category"),
                account: str("account"),
                sourceFile: str(PB.statements.sourceFile),
                goalId: str(PB.statements.goalId),
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
    } catch {
      // proceed without dedup
    }

    let rulesCreated = 0;
    let billsUpserted = 0;
    const affectedGoalIds = new Set<string>();

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
      const serverStmt = stmtById.get(item.statementId);
      const description = item.description?.trim() || serverStmt?.description || "";
      const amount = item.amount ?? serverStmt?.amount ?? 0;

      if (!description && !item.pattern) {
        continue;
      }

      const pattern = (item.pattern && item.pattern.trim()) || makeStatementPattern(description);
      const targetType = item.targetType;
      const targetSection = item.targetSection ?? null;
      const goalId = item.goalId && item.goalId.trim() ? item.goalId.trim() : null;
      const targetName =
        (item.targetName && item.targetName.trim()) ||
        description.slice(0, 40) ||
        "Item";

      const prevGoalId = serverStmt?.goalId && serverStmt.goalId.trim() ? serverStmt.goalId.trim() : null;
      if (prevGoalId) affectedGoalIds.add(prevGoalId);
      if (goalId) affectedGoalIds.add(goalId);

      // Save goalId and bill tag to statement (same fields as Add Transfers "Count as bill") so
      // "paid this month" works the same whether tagged from Add items to bills or Add Transfers.
      const isBillLike =
        (targetType === "bill" || targetType === "subscription" || targetType === "spanish_fork" || targetType === "variable_expense") &&
        targetSection &&
        targetName;
      const stmtPatch = {
        [PB.statements.goalId]: goalId ?? "",
        [PB.statements.targetType]: isBillLike ? targetType : "",
        [PB.statements.targetSection]: isBillLike ? targetSection : "",
        [PB.statements.targetName]: isBillLike ? targetName : "",
      };
      try {
        const patchRes = await fetch(
          `${statementPatchBase}/api/collections/statements/records/${item.statementId}`,
          {
            method: "PATCH",
            headers: statementPatchHeaders,
            body: JSON.stringify(stmtPatch),
          }
        );
        if (!patchRes.ok) {
          await patchRes.text();
        }
      } catch {
        // PATCH failed, continue with rule upsert
      }

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
              name: targetName,
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
              name: targetName,
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

    if (affectedGoalIds.size > 0 && statementPatchHeaders.Authorization) {
      const hdrs = statementPatchHeaders as Record<string, string>;
      for (const gid of affectedGoalIds) {
        try {
          await syncGoalFromStatements(gid, statementPatchBase, hdrs);
        } catch {
          // best-effort goal sync
        }
      }
    }

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

