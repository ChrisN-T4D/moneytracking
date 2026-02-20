/**
 * Shared bill cycle utilities used by BillsList and SpanishForkSection.
 */
import type { ActualBreakdownItem } from "./statementTagging";

/** Add one billing cycle to a date based on a frequency string. */
export function addCycle(date: Date, freq: string): Date {
  const d = new Date(date);
  const f = (freq ?? "").toLowerCase().replace(/\s/g, "");
  if (f === "monthly") d.setMonth(d.getMonth() + 1);
  else if (f === "2weeks") d.setDate(d.getDate() + 14);
  else if (f === "yearly") d.setFullYear(d.getFullYear() + 1);
  return d;
}

/** Given a bill's breakdown items, return the most recent payment date or null. */
export function lastPaidDate(breakdown: ActualBreakdownItem[] | undefined): Date | null {
  if (!breakdown || breakdown.length === 0) return null;
  const sorted = [...breakdown].sort((a, b) => b.date.localeCompare(a.date));
  return new Date(sorted[0].date);
}

/** Determine paid-cycle status for a bill row. Returns null if we can't tell. */
export function paidCycleStatus(
  frequency: string,
  breakdown: ActualBreakdownItem[] | undefined,
  _paidAmt: number | undefined
): { isPaid: boolean; lastDate: Date; nextCycleDate: Date } | null {
  const last = lastPaidDate(breakdown);
  if (!last) return null;
  const nextCycle = addCycle(last, frequency);
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const isPaid = nextCycle > today;
  return { isPaid, lastDate: last, nextCycleDate: nextCycle };
}
