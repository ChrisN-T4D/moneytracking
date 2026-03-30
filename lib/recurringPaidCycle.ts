/**
 * Cycle keys for manual "mark paid" in the Recurring tab (stored per bill in PocketBase).
 * - monthly: m:YYYY-MM (calendar month being viewed)
 * - yearly: y:YYYY (year of the occurrence date)
 * - 2weeks: b:YYYY-MM-DD (paycheck period end date, same window logic as billCycleUtils)
 */
import type { PaycheckConfig } from "./types";
import { allPayDatesNearMonth } from "./summaryCalculations";

function toDateOnly(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

export function viewMonthKey(year: number, monthIndex: number): string {
  return `${year}-${String(monthIndex + 1).padStart(2, "0")}`;
}

/** Biweekly cycle key: period end date P such that due falls in [P-14, P] (inclusive, date strings). */
export function biweeklyCycleKeyForDue(
  dueYmd: string,
  payPeriodEndDates: Date[]
): string {
  const ends = [...new Set(payPeriodEndDates.map((d) => toDateOnly(d)))].sort();
  for (const endStr of ends) {
    const end = new Date(
      Number(endStr.slice(0, 4)),
      Number(endStr.slice(5, 7)) - 1,
      Number(endStr.slice(8, 10))
    );
    const start = new Date(end);
    start.setDate(start.getDate() - 14);
    const startStr = toDateOnly(start);
    if (dueYmd >= startStr && dueYmd <= endStr) return `b:${endStr}`;
  }
  for (const endStr of ends) {
    if (dueYmd <= endStr) return `b:${endStr}`;
  }
  if (ends.length > 0) return `b:${ends[ends.length - 1]!}`;
  return `b:${dueYmd}`;
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
