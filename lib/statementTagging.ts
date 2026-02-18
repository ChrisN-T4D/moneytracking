import type {
  StatementRecord,
  StatementTagRule,
  StatementTagTargetType,
  BillListAccount,
  BillListType,
} from "./types";
import { suggestBillGroup, billNameFromDescription } from "./statementsAnalysis";

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

/** Simple pattern key based on description (first few words uppercased). */
export function makeStatementPattern(description: string): string {
  return description.trim().split(/\s+/).slice(0, 3).join(" ").toUpperCase();
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

  // Try exact pattern match first (HIGH confidence)
  const exactMatch = rules.find((r) => r.pattern.toUpperCase() === pat);
  if (exactMatch) {
    const confidence = calculateConfidence(exactMatch);
    return { rule: exactMatch, confidence, matchType: "exact_pattern" };
  }

  // Try normalized description match (MEDIUM confidence)
  const normalizedMatch = rules.find(
    (r) =>
      r.normalizedDescription &&
      r.normalizedDescription.toLowerCase() === norm.toLowerCase()
  );
  if (normalizedMatch) {
    const confidence = calculateConfidence(normalizedMatch);
    return { rule: normalizedMatch, confidence, matchType: "normalized_description" };
  }

  return null;
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
    const matched = matchRule(rules, s);
    if (matched) {
      return {
        statement: s,
        targetType: matched.rule.targetType,
        targetSection: matched.rule.targetSection,
        targetName:
          matched.rule.targetName ?? matched.rule.normalizedDescription ?? billNameFromDescription(s.description),
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

export function computeLastMonthActuals(
  statements: StatementRecord[],
  rules: StatementTagRule[],
  today: Date
): { monthName: string; rows: ActualRow[] } {
  const year = today.getMonth() === 0 ? today.getFullYear() - 1 : today.getFullYear();
  const month = today.getMonth() === 0 ? 11 : today.getMonth() - 1;
  const monthName = new Date(year, month, 1).toLocaleString("en-US", {
    month: "long",
  });

  const monthStart = new Date(year, month, 1);
  const monthEnd = new Date(year, month + 1, 1);

  const inMonth = statements.filter((s) => {
    const d = new Date(s.date);
    return d >= monthStart && d < monthEnd;
  });

  const suggestions = suggestTagsForStatements(inMonth, rules);

  const map = new Map<string, ActualRow>();

  for (const sug of suggestions) {
    if (
      !["bill", "subscription", "spanish_fork"].includes(sug.targetType) ||
      !sug.targetSection
    ) {
      continue;
    }
    const listType: BillListType =
      sug.targetType === "subscription" ? "subscriptions" : "bills";
    const key = `${sug.targetSection}|${sug.targetName}|${listType}`;

    const prev = map.get(key);
    const amount = Math.abs(sug.statement.amount);
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
  }

  return { monthName, rows: Array.from(map.values()) };
}

