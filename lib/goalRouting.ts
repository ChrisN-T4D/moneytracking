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
};

function canonicalKey(s: string | null | undefined): string {
  const k = normalize(s);
  return CANONICAL_ALIASES[k] ?? k;
}

/**
 * Find goals whose category matches a bill name (case-insensitive, with aliases).
 */
export function goalsForBillName(
  goals: GoalPick[],
  billName: string | null | undefined
): GoalPick[] {
  const key = canonicalKey(billName);
  if (!key) return [];
  return goals.filter((g) => canonicalKey(g.category) === key);
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
