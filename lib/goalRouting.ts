/**
 * Match recurring bill names to money goals via goal.category.
 * Bill "Payback Family" matches goal with category "Family Payback" via canonical aliases.
 */
import type { MoneyGoal } from "./types";
import { displayBillName } from "./format";

export type GoalPick = Pick<MoneyGoal, "id" | "name" | "category">;

function normalize(s: string | null | undefined): string {
  return (s ?? "").trim().toLowerCase();
}

const CANONICAL_ALIASES: Record<string, string> = {
  "family payback": "payback_family",
  "payback family": "payback_family",
  "payback jeff": "payback_jeff",
  "jeff payback": "payback_jeff",
};

function canonicalKey(s: string | null | undefined): string {
  const k = normalize(s);
  return CANONICAL_ALIASES[k] ?? k;
}

function subsectionLabelFromGroupKey(groupKey: string | null | undefined): string | null {
  const raw = (groupKey ?? "").trim();
  if (!raw.includes("|")) return null;
  const sub = raw.split("|")[0]?.trim() ?? "";
  if (!sub || sub.startsWith("__")) return null;
  return sub;
}

/**
 * Find goals whose category matches a bill name (case-insensitive, with aliases).
 * When PocketBase subsection is set, group keys look like `Subsection|Bill name`; if the bill name
 * does not match any goal category, also match goals whose category equals that subsection (UI copy
 * often says category matches subsection).
 */
export function goalsForBillName(
  goals: GoalPick[],
  billName: string | null | undefined,
  billSubsectionGroupKey?: string | null
): GoalPick[] {
  const key = canonicalKey(billName);
  if (key) {
    const byName = goals.filter((g) => canonicalKey(g.category) === key);
    if (byName.length > 0) return byName;
  }
  const sub = subsectionLabelFromGroupKey(billSubsectionGroupKey);
  if (!sub) return [];
  const subKey = canonicalKey(sub);
  if (!subKey) return [];
  return goals.filter((g) => canonicalKey(g.category) === subKey);
}

function normDisplayName(s: string): string {
  return displayBillName(s).trim().toLowerCase();
}

function billNameMatchesGoalName(
  billName: string,
  goalName: string
): boolean {
  return normDisplayName(billName) === normDisplayName(goalName);
}

/**
 * Credit amount: sum member amounts whose name matches the goal name.
 * Falls back to line total when no names match or matched sum is 0.
 */
export function creditAmountForMarkPaid(
  members: { name: string; amount: number }[],
  goal: Pick<MoneyGoal, "name">,
  lineTotal: number
): number {
  const matched = members.filter((m) =>
    billNameMatchesGoalName(m.name, goal.name)
  );
  if (matched.length === 0) return lineTotal;
  const sum = matched.reduce((s, m) => s + (Number(m.amount) || 0), 0);
  return sum > 0 ? sum : lineTotal;
}
