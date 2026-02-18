import { NextResponse } from "next/server";
import {
  getStatements,
  getStatementTagRules,
  getBillsWithMeta,
  getSpanishForkBills,
  getGoals,
} from "@/lib/pocketbase";
import { getAdminToken } from "@/lib/pocketbase-setup";
import type {
  StatementRecord,
  StatementTagTargetType,
  BillListAccount,
  BillListType,
} from "@/lib/types";
import { suggestTagsForStatements, makeStatementPattern, matchRule } from "@/lib/statementTagging";

const POCKETBASE_URL = process.env.NEXT_PUBLIC_POCKETBASE_URL ?? "";

function apiBase(): string {
  const url = POCKETBASE_URL.replace(/\/$/, "");
  if (url.endsWith("/_")) return url.replace(/\/_\/?$/, "") || url;
  return url;
}

const baseUrlForAuth = () =>
  (process.env.POCKETBASE_API_URL ?? process.env.NEXT_PUBLIC_POCKETBASE_URL ?? "").trim();

/** Fetch statements; if 0 and admin env set, retry with admin auth (for restricted List rule). */
async function getStatementsForTagging(): Promise<StatementRecord[]> {
  let statements = await getStatements({ perPage: 500, sort: "-date" });
  if (statements.length > 0) return statements;

  const url = baseUrlForAuth();
  const email = process.env.POCKETBASE_ADMIN_EMAIL ?? "";
  const password = process.env.POCKETBASE_ADMIN_PASSWORD ?? "";
  if (!url || !email || !password) return statements;

  try {
    const { token, baseUrl } = await getAdminToken(url, email, password);
    const apiBase = baseUrl.replace(/\/$/, "");
    const res = await fetch(
      `${apiBase}/api/collections/statements/records?perPage=500&sort=-date`,
      { headers: { Authorization: `Bearer ${token}` }, cache: "no-store" }
    );
    if (!res.ok) return statements;
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
      }>;
    };
    statements = (data.items ?? []).map((item) => ({
      id: item.id,
      date: item.date ?? "",
      description: item.description ?? "",
      amount: Number(item.amount) || 0,
      balance: item.balance != null ? Number(item.balance) : null,
      category: item.category ?? null,
      account: item.account ?? null,
      sourceFile: item.sourceFile ?? null,
    }));
  } catch {
    // keep statements as []
  }
  return statements;
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
        message: hasAdmin
          ? "No statements found in PocketBase. Import some statements first using the upload form above."
          : "No statements found. Import some statements first. If statements exist but aren't showing, set POCKETBASE_ADMIN_EMAIL and POCKETBASE_ADMIN_PASSWORD in .env.local.",
      });
    }

    // Filter to only untagged statements (no goalId set) - these need manual review
    const untaggedStatements = statements.filter((s) => !s.goalId);
    
    // Generate suggestions for untagged statements (already includes confidence)
    const suggestions = suggestTagsForStatements(untaggedStatements, rules);

    // In PocketBase: name = subsection, so targetName IS the subsection
    const payload = suggestions.map((s) => ({
      id: s.statement.id,
      date: s.statement.date,
      description: s.statement.description,
      amount: s.statement.amount,
      suggestion: {
        targetType: s.targetType,
        targetSection: s.targetSection,
        targetName: s.targetName, // This is the subsection/name
        goalId: s.goalId ?? null,
        confidence: s.confidence ?? "LOW",
        matchType: s.matchType ?? "heuristic",
        // Only auto-tag HIGH confidence exact pattern matches
        hasMatchedRule: s.confidence === "HIGH" && s.matchType === "exact_pattern",
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

    // Fetch statements so we can derive patterns and amounts.
    const statements = await getStatements({ perPage: 1000, sort: "-date" });
    const byId = new Map<string, StatementRecord>(
      statements.map((s) => [s.id, s])
    );

    let rulesCreated = 0;
    let billsUpserted = 0;

    for (const item of items) {
      const stmt = byId.get(item.statementId);
      if (!stmt) continue;

      const pattern = (item.pattern && item.pattern.trim()) || makeStatementPattern(stmt.description);
      const targetType = item.targetType;
      const targetSection = item.targetSection ?? null;
      const goalId = item.goalId && item.goalId.trim() ? item.goalId.trim() : null;
      // In PocketBase: name = subsection, so targetName is the subsection/name
      const targetName =
        (item.targetName && item.targetName.trim()) ||
        stmt.description.slice(0, 40) ||
        "Item";

      // Save goalId to statement record
      if (goalId) {
        try {
          await fetch(`${base}/api/collections/statements/records/${item.statementId}`, {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ goalId }),
          });
        } catch (err) {
          console.error(`Failed to save goalId to statement ${item.statementId}:`, err);
        }
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

      // If this is a bill-like tag, upsert into appropriate collection using the current amount.
      if (
        (targetType === "bill" ||
          targetType === "subscription" ||
          targetType === "spanish_fork") &&
        targetSection
      ) {
        const amount = Math.abs(stmt.amount);

        if (targetSection === "spanish_fork") {
          // Spanish Fork bills: name = subsection, no account/listType
          const sfPayload = {
            name: targetName, // name IS the subsection
            frequency: "monthly",
            nextDue: new Date().toISOString().slice(0, 10),
            inThisPaycheck: false,
            amount,
            tenantPaid: null,
          };
          const res = await fetch(
            `${base}/api/collections/spanish_fork_bills/records`,
            {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify(sfPayload),
            }
          );
          if (res.ok) billsUpserted++;
        } else {
          const account: BillListAccount = targetSection;
          const listType: BillListType =
            targetType === "subscription" ? "subscriptions" : "bills";

          // In PocketBase: name = subsection, account = bills_account/checking_account, listType = bills/subscriptions
          const billPayload = {
            name: targetName, // name IS the subsection
            frequency: "monthly",
            nextDue: new Date().toISOString().slice(0, 10),
            inThisPaycheck: false,
            amount,
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
          if (res.ok) billsUpserted++;
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

