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
}

/** Simple pattern key based on description (first few words uppercased). */
export function makeStatementPattern(description: string): string {
  return description.trim().split(/\s+/).slice(0, 3).join(" ").toUpperCase();
}

function matchRule(
  rules: StatementTagRule[],
  statement: StatementRecord
): StatementTagRule | null {
  const pat = makeStatementPattern(statement.description);
  const norm = billNameFromDescription(statement.description);

  return (
    rules.find((r) => r.pattern.toUpperCase() === pat) ??
    rules.find(
      (r) =>
        r.normalizedDescription &&
        r.normalizedDescription.toLowerCase() === norm.toLowerCase()
    ) ??
    null
  );
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
        targetType: matched.targetType,
        targetSection: matched.targetSection,
        targetName:
          matched.targetName ?? matched.normalizedDescription ?? billNameFromDescription(s.description),
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
      };
    }

    return {
      statement: s,
      targetType: "ignore",
      targetSection: null,
      targetName: billNameFromDescription(s.description),
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

