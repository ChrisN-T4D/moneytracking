import type {
  StatementRecord,
  StatementTagRule,
  StatementTagTargetType,
  BillListAccount,
  BillListType,
} from "./types";
import { suggestBillGroup, billNameFromDescription, isTransferDescription } from "./statementsAnalysis";

/** One suggestion row for the tagging wizard. */
export interface StatementTagSuggestion {
  statement: StatementRecord;
  targetType: StatementTagTargetType;
  targetSection: BillListAccount | "spanish_fork" | null;
  targetName: string; // In PocketBase: name = subsection, so this IS the subsection
  /** Optional goal ID this statement contributes to (PocketBase `goals` collection). */
  goalId?: string | null;
  /** Confidence level of this suggestion. */
  confidence?: "HIGH" | "MEDIUM" | "LOW";
  /** How this suggestion was matched. */
  matchType?: "exact_pattern" | "normalized_description" | "heuristic";
}

/**
 * Pattern key for matching statements to rules.
 * For Wells Fargo-style "PURCHASE AUTHORIZED ON MM/DD MERCHANT..." we use the merchant part
 * so each store gets its own pattern (e.g. "GROOM CLOSET PET" vs "ENID PET HOSPITAL").
 * Otherwise we'd get "PURCHASE AUTHORIZED ON" for every purchase and one tag would match all.
 */
export function makeStatementPattern(description: string): string {
  const d = description.trim();
  if (!d) return "";

  // Strip "PURCHASE AUTHORIZED ON MM/DD" or "TRANSFER AUTHORIZED ON MM/DD" prefix
  // Wells Fargo uses both for different transaction types (debit card vs P2P)
  const authorizedMatch = d.match(
    /^(?:PURCHASE|TRANSFER|MONEY\s+TRANSFER)\s+AUTHORIZED\s+ON\s+\d{1,2}[\/\-]\d{1,2}(?:[\/\-]\d{2,4})?\s+(.+)$/i
  );
  const merchantPart = authorizedMatch ? authorizedMatch[1].trim() : null;

  // The core string to analyze (merchant part if available, else full description)
  const core = merchantPart ?? d;

  // Amazon: normalize all Amazon/AMZN purchases to a single stable pattern
  // Descriptions vary per transaction ("AMAZON.COM/BILLWA", "AMZN MKTP US*AB123", etc.)
  if (/^(AMAZON|AMZN)\b/i.test(core)) {
    return "AMAZON";
  }

  // Venmo: "VENMO * RACHEL DEMILLE CA" - extract person/merchant name after the asterisk
  const venmoMatch = core.match(/^VENMO\s*\*\s*(.+)$/i);
  if (venmoMatch) {
    const rest = venmoMatch[1].trim();
    // Strip trailing 2-letter state code (e.g., "CA", "NY", "WA")
    const cleaned = rest.replace(/\s+[A-Z]{2}$/i, "").trim();
    const words = cleaned.split(/\s+/).slice(0, 3).join(" ").toUpperCase();
    return `VENMO ${words}`;
  }

  // If we extracted a merchant part (from AUTHORIZED ON prefix), use first 4 words
  if (merchantPart) {
    const words = merchantPart.split(/\s+/).slice(0, 4).join(" ").toUpperCase();
    return words || d.split(/\s+/).slice(0, 3).join(" ").toUpperCase();
  }

  // PayPal: "PAYPAL INST XFER 260214 DISCORD CHRISTOPHER NEU"
  const paypalMatch = d.match(/^PAYPAL\s+INST\s+XFER\s+\d{6}\s+(.+)$/i);
  if (paypalMatch) {
    const rest = paypalMatch[1].trim();
    const words = rest.split(/\s+/).slice(0, 3).join(" ").toUpperCase();
    return words || d.split(/\s+/).slice(0, 3).join(" ").toUpperCase();
  }

  // Zelle: "ZELLE TO KERRIE" or "ZELLE FROM ..."
  const zelleMatch = d.match(/^ZELLE\s+(TO|FROM)\s+(\S+)/i);
  if (zelleMatch) {
    return `ZELLE ${zelleMatch[1].toUpperCase()} ${zelleMatch[2].toUpperCase()}`;
  }

  // Fallback: first 3 words of full description
  return d.split(/\s+/).slice(0, 3).join(" ").toUpperCase();
}

export interface MatchResult {
  rule: StatementTagRule;
  confidence: "HIGH" | "MEDIUM" | "LOW";
  matchType: "exact_pattern" | "normalized_description" | "heuristic";
}

export function matchRule(
  rules: StatementTagRule[],
  statement: StatementRecord
): MatchResult | null {
  const pat = makeStatementPattern(statement.description);
  const norm = billNameFromDescription(statement.description);

  const exactMatches = rules.filter((r) => r.pattern.toUpperCase() === pat);
  const normalizedMatches = rules.filter(
    (r) =>
      r.normalizedDescription &&
      r.normalizedDescription.toLowerCase() === norm.toLowerCase()
  );

  // Prefer manual override over rule-of-thumb: among all matches, pick the one the user has explicitly used (overrideCount > 0)
  type Candidate = { rule: StatementTagRule; matchType: "exact_pattern" | "normalized_description" };
  const raw: Candidate[] = [
    ...exactMatches.map((rule) => ({ rule, matchType: "exact_pattern" as const })),
    ...normalizedMatches.map((rule) => ({ rule, matchType: "normalized_description" as const })),
  ];
  const seen = new Set<string>();
  const unique: Candidate[] = [];
  for (const c of raw) {
    if (seen.has(c.rule.id)) continue;
    seen.add(c.rule.id);
    unique.push(c);
  }

  if (unique.length === 0) return null;

  // Sort: manual override (overrideCount > 0) first, then exact before normalized, then by confidence
  const overrideCount = (r: StatementTagRule) => r.overrideCount ?? 0;
  const score = (c: Candidate) => {
    const conf = calculateConfidence(c.rule);
    const confOrder = conf === "HIGH" ? 3 : conf === "MEDIUM" ? 2 : 1;
    return [
      overrideCount(c.rule) > 0 ? 1 : 0,
      c.matchType === "exact_pattern" ? 1 : 0,
      confOrder,
    ].join(",");
  };
  unique.sort((a, b) => (score(b).localeCompare(score(a))));

  const chosen = unique[0]!;
  const confidence = calculateConfidence(chosen.rule);
  return { rule: chosen.rule, confidence, matchType: chosen.matchType };
}

/** Calculate confidence level based on rule usage statistics. */
function calculateConfidence(rule: StatementTagRule): "HIGH" | "MEDIUM" | "LOW" {
  const useCount = rule.useCount ?? 0;
  const overrideCount = rule.overrideCount ?? 0;
  const totalUses = useCount + overrideCount;

  // If rule has been used successfully 3+ times with no overrides, HIGH confidence
  if (useCount >= 3 && overrideCount === 0) return "HIGH";
  
  // If rule has been used successfully 5+ times with <20% override rate, HIGH confidence
  if (useCount >= 5 && totalUses > 0 && overrideCount / totalUses < 0.2) return "HIGH";
  
  // If rule has been used 2+ times with no overrides, MEDIUM confidence
  if (useCount >= 2 && overrideCount === 0) return "MEDIUM";
  
  // If rule has been used but has overrides, MEDIUM confidence (user can review)
  if (useCount > 0 && overrideCount > 0 && overrideCount / totalUses < 0.5) return "MEDIUM";
  
  // New rule or high override rate, LOW confidence
  return "LOW";
}

export function suggestTagsForStatements(
  statements: StatementRecord[],
  rules: StatementTagRule[]
): StatementTagSuggestion[] {
  return statements.map((s) => {
    const heuristicName = billNameFromDescription(s.description);
    const matched = matchRule(rules, s);
    if (matched) {
      // Use the rule's target name (e.g. user set "Groceries & Gas"); never override back to heuristic like "Walmart"
      const targetName =
        matched.rule.targetName ?? matched.rule.normalizedDescription ?? heuristicName;
      return {
        statement: s,
        targetType: matched.rule.targetType,
        targetSection: matched.rule.targetSection,
        targetName,
        goalId: matched.rule.goalId ?? null,
        confidence: matched.confidence,
        matchType: matched.matchType,
      };
    }

    if (s.amount < 0) {
      const name = billNameFromDescription(s.description);
      const group = suggestBillGroup(name);
      const targetType: StatementTagTargetType =
        group.listType === "subscriptions" ? "subscription" : "bill";
      return {
        statement: s,
        targetType,
        targetSection: group.section,
        targetName: name,
        confidence: "LOW",
        matchType: "heuristic",
      };
    }

    return {
      statement: s,
      targetType: "ignore",
      targetSection: null,
      targetName: billNameFromDescription(s.description),
      confidence: "LOW",
      matchType: "heuristic",
    };
  });
}

export interface ActualRow {
  name: string;
  section: BillListAccount | "spanish_fork";
  listType?: BillListType;
  actualAmount: number;
}

/**
 * Sum tagged statement amounts for a given calendar month, grouped by subsection (section + listType + name).
 * Used for both "paid this month" (current month) and "Actual {monthName}" (last month).
 */
export function computeActualsForMonth(
  statements: StatementRecord[],
  rules: StatementTagRule[],
  year: number,
  month: number
): ActualRow[] {
  const monthStart = new Date(year, month, 1);
  const monthEnd = new Date(year, month + 1, 1);
  const inMonth = statements.filter((s) => {
    const d = new Date(s.date);
    if (d < monthStart || d >= monthEnd) return false;
    // Skip transfer check for statements that have an explicit tag rule — the user
    // intentionally tagged them (e.g. a utility ACH debit that looks like a transfer).
    const hasExplicitRule = matchRule(rules, s) !== null;
    if (!hasExplicitRule && isTransferDescription(s.description ?? "")) return false;
    return true;
  });
  const suggestions = suggestTagsForStatements(inMonth, rules);
  const map = new Map<string, ActualRow>();

  for (const sug of suggestions) {
    // Only count statements where a real rule matched — never count heuristic guesses.
    // Heuristic suggestions have matchType === "heuristic" and no rule behind them.
    if (sug.matchType === "heuristic") continue;
    if (
      !["bill", "subscription", "spanish_fork", "variable_expense"].includes(sug.targetType) ||
      !sug.targetSection
    ) {
      continue;
    }
    const listType: BillListType =
      sug.targetType === "subscription" ? "subscriptions" : "bills";
    const key = `${sug.targetSection}|${sug.targetName ?? ""}|${listType}`;
    const prev = map.get(key);
    const amount = Math.abs(sug.statement.amount);
    if (prev) {
      prev.actualAmount += amount;
    } else {
      map.set(key, {
        name: sug.targetName ?? "Variable expenses",
        section: sug.targetSection,
        listType,
        actualAmount: amount,
      });
    }
  }
  return Array.from(map.values());
}

/** Last calendar month's actuals (for "Actual {monthName}" table). */
export function computeLastMonthActuals(
  statements: StatementRecord[],
  rules: StatementTagRule[],
  today: Date
): { monthName: string; rows: ActualRow[] } {
  const year = today.getMonth() === 0 ? today.getFullYear() - 1 : today.getFullYear();
  const month = today.getMonth() === 0 ? 11 : today.getMonth() - 1;
  const monthName = new Date(year, month, 1).toLocaleString("en-US", { month: "long" });
  const rows = computeActualsForMonth(statements, rules, year, month);
  return { monthName, rows };
}

/** Current calendar month's actuals — tagged statements count toward each subsection's "paid this month". */
export function computeThisMonthActuals(
  statements: StatementRecord[],
  rules: StatementTagRule[],
  today: Date
): ActualRow[] {
  return computeActualsForMonth(
    statements,
    rules,
    today.getFullYear(),
    today.getMonth()
  );
}

/** One contributing transaction for the breakdown popup. */
export interface ActualBreakdownItem {
  date: string;
  description: string;
  amount: number;
}

/**
 * Same as computeActualsForMonth but also returns per-bill breakdown of contributing statements.
 * Key = `${section}|${listType}|${name.toLowerCase()}` to match paidThisMonthByBill.
 */
export function computeActualsForMonthWithBreakdown(
  statements: StatementRecord[],
  rules: StatementTagRule[],
  year: number,
  month: number
): { rows: ActualRow[]; breakdown: Map<string, ActualBreakdownItem[]> } {
  const monthStart = new Date(year, month, 1);
  const monthEnd = new Date(year, month + 1, 1);
  const inMonth = statements.filter((s) => {
    const d = new Date(s.date);
    if (d < monthStart || d >= monthEnd) return false;
    // Skip transfer check for statements that have an explicit tag rule — the user
    // intentionally tagged them (e.g. a utility ACH debit that looks like a transfer).
    const hasExplicitRule = matchRule(rules, s) !== null;
    if (!hasExplicitRule && isTransferDescription(s.description ?? "")) return false;
    return true;
  });
  const suggestions = suggestTagsForStatements(inMonth, rules);
  const map = new Map<string, ActualRow>();
  const breakdown = new Map<string, ActualBreakdownItem[]>();

  for (const sug of suggestions) {
    if (sug.matchType === "heuristic") continue;
    if (
      !["bill", "subscription", "spanish_fork", "variable_expense"].includes(sug.targetType) ||
      !sug.targetSection
    ) {
      continue;
    }
    const listType: BillListType =
      sug.targetType === "subscription" ? "subscriptions" : "bills";
    const nameLower = (sug.targetName ?? "").toLowerCase();
    const key = `${sug.targetSection}|${listType}|${nameLower}`;
    const amount = Math.abs(sug.statement.amount);
    const item: ActualBreakdownItem = {
      date: sug.statement.date,
      description: sug.statement.description ?? "",
      amount,
    };

    const prev = map.get(key);
    if (prev) {
      prev.actualAmount += amount;
    } else {
      map.set(key, {
        name: sug.targetName,
        section: sug.targetSection,
        listType,
        actualAmount: amount,
      });
    }
    if (!breakdown.has(key)) breakdown.set(key, []);
    breakdown.get(key)!.push(item);
  }
  return { rows: Array.from(map.values()), breakdown };
}

/** Key used in paidThisMonthByBill for variable expenses (checking_account bills). */
export const VARIABLE_EXPENSES_BILL_KEY = "checking_account|bills|variable expenses";

/** Sum of tagged statement amounts for given bill keys within [startDate, endDate). Used for per-paycheck groceries & gas. */
export function computeSpentForBillKeysInDateRange(
  statements: StatementRecord[],
  rules: StatementTagRule[],
  startDate: Date,
  endDate: Date,
  billKeys: string[]
): number {
  const keySet = new Set(billKeys.map((k) => k.toLowerCase()));
  const start = new Date(startDate.getFullYear(), startDate.getMonth(), startDate.getDate());
  const end = new Date(endDate.getFullYear(), endDate.getMonth(), endDate.getDate());
  const inRange = statements.filter((s) => {
    const d = new Date(s.date);
    if (Number.isNaN(d.getTime())) return false;
    const day = new Date(d.getFullYear(), d.getMonth(), d.getDate());
    if (day < start || day >= end) return false;
    if (isTransferDescription(s.description ?? "")) return false;
    return true;
  });
  const suggestions = suggestTagsForStatements(inRange, rules);
  let sum = 0;
  for (const sug of suggestions) {
    if (sug.matchType === "heuristic") continue;
    if (
      !["bill", "subscription", "spanish_fork"].includes(sug.targetType) ||
      !sug.targetSection
    )
      continue;
    const listType: BillListType =
      sug.targetType === "subscription" ? "subscriptions" : "bills";
    const key = `${sug.targetSection}|${listType}|${sug.targetName.toLowerCase()}`;
    if (keySet.has(key)) sum += Math.abs(sug.statement.amount);
  }
  return sum;
}

