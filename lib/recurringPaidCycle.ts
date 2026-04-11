/**
 * Cycle keys for manual "mark paid" in the Recurring tab (stored per bill in PocketBase).
 * - monthly: m:YYYY-MM (calendar month being viewed)
 * - yearly: y:YYYY (year of the occurrence date)
 * - 2weeks: b:YYYY-MM-DD (paycheck period end date, same window logic as billCycleUtils)
 */
import type { PaycheckConfig } from "./types";
import { biweeklyCycleKeyForDue } from "./biweeklyCycleKey";
import { allPayDatesNearMonth } from "./summaryCalculations";

export function viewMonthKey(year: number, monthIndex: number): string {
  return `${year}-${String(monthIndex + 1).padStart(2, "0")}`;
}

export function recurringCycleKeyForExpense(
  occurrenceYmd: string,
  frequency: string,
  viewYear: number,
  viewMonthIndex: number,
  paycheckConfigs: PaycheckConfig[],
  payDatesCached?: { date: Date; amount: number; name: string }[]
): string {
  const f = (frequency ?? "").toLowerCase().replace(/\s/g, "");
  if (f === "monthly") {
    return `m:${viewMonthKey(viewYear, viewMonthIndex)}`;
  }
  if (f === "yearly") {
    const y = occurrenceYmd.slice(0, 4);
    return `y:${y}`;
  }
  if (f === "2weeks") {
    const pd = payDatesCached ?? allPayDatesNearMonth(paycheckConfigs, viewYear, viewMonthIndex);
    return biweeklyCycleKeyForDue(occurrenceYmd, pd.map((p) => p.date));
  }
  return `m:${viewMonthKey(viewYear, viewMonthIndex)}`;
}

export function isManualRecurringPaidForKey(
  members: { recurringPaidCycle?: string | null; recurringPaidGoalId?: string | null }[],
  expectedKey: string,
  /** When true (goals share this bill subsection), every member must also share the same non-null recurringPaidGoalId. */
  requireGoalIds: boolean
): boolean {
  if (members.length === 0) return false;
  if (!members.every((m) => (m.recurringPaidCycle ?? "").trim() === expectedKey)) return false;
  if (!requireGoalIds) return true;
  const gid = (members[0]?.recurringPaidGoalId ?? "").trim() || null;
  if (!gid) return false;
  return members.every((m) => (m.recurringPaidGoalId ?? "").trim() === gid);
}
