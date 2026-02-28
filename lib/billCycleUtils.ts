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

/** Format YYYY-MM-DD for a date at local midnight (for comparison with statement dates). */
function toDateOnly(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

/**
 * Sum amounts in breakdown that fall within the current 2-week cycle (paycheckEnd - 14 days through paycheckEnd)
 * and the previous cycle (paycheckEnd - 28 days through paycheckEnd - 14 days).
 * Statement dates are compared as YYYY-MM-DD strings.
 */
export function paidThisAndLastCycle(
  breakdown: ActualBreakdownItem[] | undefined,
  paycheckEndDate: Date | null
): { thisCycle: number; lastCycle: number } {
  const result = { thisCycle: 0, lastCycle: 0 };
  if (!breakdown?.length || !paycheckEndDate) return result;
  const end = new Date(paycheckEndDate.getFullYear(), paycheckEndDate.getMonth(), paycheckEndDate.getDate());
  const thisStart = new Date(end);
  thisStart.setDate(thisStart.getDate() - 14);
  const lastStart = new Date(thisStart);
  lastStart.setDate(lastStart.getDate() - 14);
  const thisStartStr = toDateOnly(thisStart);
  const thisEndStr = toDateOnly(end);
  const lastEnd = new Date(thisStart);
  lastEnd.setDate(lastEnd.getDate() - 1);
  const lastStartStr = toDateOnly(lastStart);
  const lastEndStr = toDateOnly(lastEnd);
  for (const t of breakdown) {
    const dateStr = t.date.slice(0, 10);
    if (dateStr >= thisStartStr && dateStr <= thisEndStr) result.thisCycle += t.amount;
    else if (dateStr >= lastStartStr && dateStr <= lastEndStr) result.lastCycle += t.amount;
  }
  return result;
}
