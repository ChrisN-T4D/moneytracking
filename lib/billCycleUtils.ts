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

/** Format YYYY-MM-DD for a date at local midnight (for comparison with statement dates). */
function toDateOnly(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

/**
 * Sum amounts in breakdown for "this cycle" and "last cycle".
 * - When frequency is "monthly": this cycle = calendar month of `calendarRef` (if set) else `paycheckEndDate` else today; last cycle = previous month.
 * - Otherwise (e.g. 2weeks): this cycle = 2-week window (paycheckEnd - 14 days through paycheckEnd), last = prior 2 weeks.
 * Statement dates are compared as YYYY-MM-DD strings.
 */
export function paidThisAndLastCycle(
  breakdown: ActualBreakdownItem[] | undefined,
  paycheckEndDate: Date | null,
  frequency?: string,
  calendarRef?: Date | null
): { thisCycle: number; lastCycle: number } {
  const result = { thisCycle: 0, lastCycle: 0 };
  if (!breakdown?.length) return result;
  const freqNorm = (frequency ?? "").toLowerCase().replace(/\s/g, "");
  const isMonthly = freqNorm === "monthly";
  const ref = isMonthly ? (calendarRef ?? paycheckEndDate ?? new Date()) : (paycheckEndDate ?? new Date());
  const end = new Date(ref.getFullYear(), ref.getMonth(), ref.getDate());

  let thisStartStr: string;
  let thisEndStr: string;
  let lastStartStr: string;
  let lastEndStr: string;

  if (freqNorm === "monthly") {
    const thisStart = new Date(end.getFullYear(), end.getMonth(), 1);
    const thisEnd = new Date(end.getFullYear(), end.getMonth() + 1, 0);
    thisStartStr = toDateOnly(thisStart);
    thisEndStr = toDateOnly(thisEnd);
    const lastStart = new Date(end.getFullYear(), end.getMonth() - 1, 1);
    const lastEnd = new Date(end.getFullYear(), end.getMonth(), 0);
    lastStartStr = toDateOnly(lastStart);
    lastEndStr = toDateOnly(lastEnd);
  } else {
    if (!paycheckEndDate) return result;
    const thisStart = new Date(end);
    thisStart.setDate(thisStart.getDate() - 14);
    const lastStart = new Date(thisStart);
    lastStart.setDate(lastStart.getDate() - 14);
    thisStartStr = toDateOnly(thisStart);
    thisEndStr = toDateOnly(end);
    const lastEnd = new Date(thisStart);
    lastEnd.setDate(lastEnd.getDate() - 1);
    lastStartStr = toDateOnly(lastStart);
    lastEndStr = toDateOnly(lastEnd);
  }

  for (const t of breakdown) {
    const dateStr = t.date.slice(0, 10);
    if (dateStr >= thisStartStr && dateStr <= thisEndStr) result.thisCycle += t.amount;
    else if (dateStr >= lastStartStr && dateStr <= lastEndStr) result.lastCycle += t.amount;
  }
  return result;
}

export type PaidCycleOptions = {
  /** For monthly bills: which calendar month's payments count as "this cycle" (e.g. budgeting display month). */
  calendarRef?: Date | null;
  /** For 2-week bills: end of the current paycheck window (same as Bills list). */
  paycheckEndDate?: Date | null;
};

/**
 * Paid status aligned with `paidThisAndLastCycle` / statement month:
 * - **monthly**: paid only if there is tagged spend in the calendar month of `calendarRef` (default: today).
 * - **2weeks**: paid only if there is spend in the current 2-week window ending `paycheckEndDate`.
 * - **other** (e.g. yearly): rolling rule from most recent breakdown date (legacy).
 */
export function paidCycleStatus(
  frequency: string,
  breakdown: ActualBreakdownItem[] | undefined,
  _paidAmt: number | undefined,
  options?: PaidCycleOptions
): { isPaid: boolean; lastDate: Date; nextCycleDate: Date } | null {
  const f = (frequency ?? "").toLowerCase().replace(/\s/g, "");

  if (f === "monthly") {
    const calRef = options?.calendarRef ?? new Date();
    const r = new Date(calRef.getFullYear(), calRef.getMonth(), calRef.getDate());
    r.setHours(0, 0, 0, 0);
    const { thisCycle } = paidThisAndLastCycle(breakdown, null, "monthly", r);
    if (thisCycle <= 0) return null;
    const monthStart = new Date(r.getFullYear(), r.getMonth(), 1);
    const monthEnd = new Date(r.getFullYear(), r.getMonth() + 1, 0);
    const startStr = toDateOnly(monthStart);
    const endStr = toDateOnly(monthEnd);
    const inMonth = (breakdown ?? []).filter((t) => {
      const d = t.date.slice(0, 10);
      return d >= startStr && d <= endStr;
    });
    if (inMonth.length === 0) return null;
    const sorted = [...inMonth].sort((a, b) => b.date.localeCompare(a.date));
    const lastDate = new Date(sorted[0]!.date);
    const nextCycleDate = addCycle(lastDate, frequency);
    return { isPaid: true, lastDate, nextCycleDate };
  }

  if (f === "2weeks") {
    const pe = options?.paycheckEndDate ?? null;
    const { thisCycle } = paidThisAndLastCycle(breakdown, pe, "2weeks");
    if (thisCycle <= 0 || !pe) return null;
    const end = new Date(pe.getFullYear(), pe.getMonth(), pe.getDate());
    const thisStart = new Date(end);
    thisStart.setDate(thisStart.getDate() - 14);
    const startStr = toDateOnly(thisStart);
    const endStr = toDateOnly(end);
    const inWin = (breakdown ?? []).filter((t) => {
      const d = t.date.slice(0, 10);
      return d >= startStr && d <= endStr;
    });
    if (inWin.length === 0) return null;
    const sorted = [...inWin].sort((a, b) => b.date.localeCompare(a.date));
    const lastDate = new Date(sorted[0]!.date);
    const nextCycleDate = addCycle(lastDate, frequency);
    return { isPaid: true, lastDate, nextCycleDate };
  }

  const last = lastPaidDate(breakdown);
  if (!last) return null;
  const nextCycle = addCycle(last, frequency);
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const isPaid = nextCycle > today;
  return { isPaid, lastDate: last, nextCycleDate: nextCycle };
}
