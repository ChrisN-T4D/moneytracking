/** Parse a YYYY-MM-DD string (or ISO string — only the date part is used) to local midnight. */
export function parseLocalDateString(dateStr: string): Date {
  const datePart = dateStr.includes("T") ? dateStr.split("T")[0]! : dateStr;
  const [y, m, d] = datePart.split("-").map(Number);
  if (Number.isNaN(y) || Number.isNaN(m) || Number.isNaN(d)) return new Date(dateStr);
  return new Date(y, m - 1, d);
}

/** Convert a Date or YYYY-MM-DD string to a local calendar midnight Date. */
function toLocalDay(d: Date | string): Date {
  if (typeof d === "string") return parseLocalDateString(d);
  return new Date(d.getFullYear(), d.getMonth(), d.getDate());
}

/** Next Thursday on or after `date` (returns same day when already Thursday). */
export function getNextThursdayOnOrAfter(date: Date | string): Date {
  const d = toLocalDay(date);
  const day = d.getDay(); // 0=Sun … 6=Sat
  d.setDate(d.getDate() + (day <= 4 ? 4 - day : 11 - day));
  return d;
}

/** Next pay date in a biweekly series on or after `referenceDate`. Uses anchor as the actual last pay date and advances by 14 days (so e.g. anchor Feb 13 → next Feb 27). */
export function getNextPaycheckBiweekly(
  anchorDate: Date | string,
  referenceDate: Date | string = new Date()
): Date {
  const from = toLocalDay(referenceDate);
  const anchor = toLocalDay(anchorDate);
  if (Number.isNaN(anchor.getTime())) return anchor;
  const next = new Date(anchor.getTime());
  while (next < from) next.setDate(next.getDate() + 14);
  return toLocalDay(next);
}

function lastWorkingDayOfMonth(year: number, month: number): Date {
  const last = new Date(year, month + 1, 0);
  if (last.getDay() === 0) last.setDate(last.getDate() - 2);
  else if (last.getDay() === 6) last.setDate(last.getDate() - 1);
  return last;
}

/** Next "last working day of month" pay date on or after `referenceDate`. */
export function getNextPaycheckLastWorkingDayOfMonth(
  referenceDate: Date | string = new Date()
): Date {
  const from = toLocalDay(referenceDate);
  const thisMonth = lastWorkingDayOfMonth(from.getFullYear(), from.getMonth());
  if (thisMonth >= from) return thisMonth;
  return lastWorkingDayOfMonth(from.getFullYear(), from.getMonth() + 1);
}

/** Next monthly (fixed day-of-month) pay date on or after `referenceDate`. */
export function getNextPaycheckMonthly(
  dayOfMonth: number,
  referenceDate: Date | string = new Date()
): Date {
  const from = toLocalDay(referenceDate);
  const clampToMonth = (y: number, mo: number) =>
    Math.min(dayOfMonth, new Date(y, mo + 1, 0).getDate());
  const thisMonth = new Date(from.getFullYear(), from.getMonth(), clampToMonth(from.getFullYear(), from.getMonth()));
  if (thisMonth >= from) return thisMonth;
  const y = from.getFullYear();
  const mo = from.getMonth() + 1;
  return new Date(y, mo, clampToMonth(y, mo));
}

/** Format a local calendar date as "Mon D, YYYY". */
export function formatDateShort(d: Date): string {
  return toLocalDay(d).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

/** Format a local calendar date as "Mon D" (no year). */
export function formatDateNoYear(d: Date): string {
  return toLocalDay(d).toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

/** Format a date string as "Mon D" (no year). Handles YYYY-MM-DD and other parseable formats. */
export function formatDateStringNoYear(dateStr: string): string {
  if (!dateStr || !dateStr.trim()) return dateStr;
  const d = parseFlexibleDate(dateStr.trim());
  if (Number.isNaN(d.getTime())) return dateStr;
  return formatDateNoYear(d);
}

/** Format for due dates: "Mon D" when same year, "Mon D 'YY" when yearly or other year (abbreviated year for reference). */
export function formatDateForDue(dateStr: string, frequency?: string): string {
  if (!dateStr || !dateStr.trim()) return "—";
  const d = parseFlexibleDate(dateStr.trim());
  if (Number.isNaN(d.getTime())) return dateStr;
  const f = (frequency ?? "").toLowerCase();
  const isYearly = f.includes("year");
  const refYear = getTodayUTC().getUTCFullYear();
  const showYear = isYearly || d.getFullYear() !== refYear;
  if (!showYear) return formatDateNoYear(d);
  const yy = String(d.getFullYear()).slice(-2);
  return `${toLocalDay(d).toLocaleDateString("en-US", { month: "short", day: "numeric" })} '${yy}`;
}

/**
 * For a "last working day of month" paycheck that arrives at the end of month M,
 * returns the YYYY-MM string for month M+1 — the month it's intended to cover.
 * e.g. a Feb 27 paycheck → "2026-03"
 */
export function billingYearMonthForLastWorkingDay(payDate: Date): string {
  const d = toLocalDay(payDate);
  const next = new Date(d.getFullYear(), d.getMonth() + 1, 1);
  return `${next.getFullYear()}-${String(next.getMonth() + 1).padStart(2, "0")}`;
}

/**
 * The name of the month a "last working day of month" paycheck covers.
 * e.g. a Feb 27 paycheck → "March"
 */
export function billingMonthNameForLastWorkingDay(payDate: Date): string {
  const d = toLocalDay(payDate);
  const next = new Date(d.getFullYear(), d.getMonth() + 1, 1);
  return next.toLocaleString("en-US", { month: "long" });
}

/** Whole calendar days from `from` to `to` (negative when `to` is in the past). */
export function daysUntil(from: Date, to: Date): number {
  return Math.round((toLocalDay(to).getTime() - toLocalDay(from).getTime()) / 86_400_000);
}

/** Parse date string: YYYY-MM-DD, ISO, or M/D/YYYY (e.g. 2/2/2026). Returns invalid Date on failure. */
export function parseFlexibleDate(dateStr: string): Date {
  const s = (dateStr ?? "").trim();
  if (!s) return new Date(NaN);
  const isoPart = s.includes("T") ? s.split("T")[0]! : null;
  if (isoPart) {
    const [y, m, d] = isoPart.split("-").map(Number);
    if (!Number.isNaN(y) && !Number.isNaN(m) && !Number.isNaN(d))
      return new Date(y, m - 1, d);
  }
  if (s.includes("-") && s.split("-").length === 3) {
    const [y, m, d] = s.split("-").map(Number);
    if (!Number.isNaN(y) && !Number.isNaN(m) && !Number.isNaN(d))
      return new Date(y, m - 1, d);
  }
  const slashParts = s.split("/").map((x) => parseInt(x, 10));
  if (slashParts.length >= 3) {
    const [a, b, c] = slashParts;
    const y = c! >= 100 ? c! : 2000 + (c! % 100);
    const m = (a! <= 12 ? a! : b!) - 1;
    const d = a! <= 12 ? b! : a!;
    if (!Number.isNaN(y) && !Number.isNaN(m) && m >= 0 && m <= 11 && !Number.isNaN(d))
      return new Date(y, m, d);
  }
  const fallback = new Date(s);
  return Number.isNaN(fallback.getTime()) ? new Date(NaN) : toLocalDay(fallback);
}

/**
 * Next auto-transfer date by frequency on or after referenceDate.
 * frequency: "2weeks" / "2 weeks" / "monthly" / "yearly" (case-insensitive).
 * anchorDateStr: stored last/previous date (YYYY-MM-DD or M/D/YYYY).
 */
export function getNextAutoTransferDate(
  anchorDateStr: string,
  frequency: string,
  referenceDate: Date | string = new Date()
): Date {
  const anchor = parseFlexibleDate(anchorDateStr);
  if (Number.isNaN(anchor.getTime())) return anchor;
  const ref = toLocalDay(referenceDate);
  const f = (frequency ?? "").toLowerCase().trim();
  const is2W = f.includes("2") && (f.includes("week") || f.includes("wk"));
  if (is2W) {
    const next = new Date(anchor.getTime());
    while (next < ref) next.setDate(next.getDate() + 14);
    return toLocalDay(next);
  }
  if (f.includes("month")) {
    const dayOfMonth = anchor.getDate();
    const clamp = (y: number, mo: number) =>
      Math.min(dayOfMonth, new Date(y, mo + 1, 0).getDate());
    let cand = new Date(ref.getFullYear(), ref.getMonth(), clamp(ref.getFullYear(), ref.getMonth()));
    if (cand < ref) {
      const y = ref.getFullYear();
      const mo = ref.getMonth() + 1;
      cand = new Date(y, mo, clamp(y, mo));
    }
    return toLocalDay(cand);
  }
  if (f.includes("year")) {
    let cand = new Date(ref.getFullYear(), anchor.getMonth(), anchor.getDate());
    if (cand < ref) cand = new Date(ref.getFullYear() + 1, anchor.getMonth(), anchor.getDate());
    const lastDay = new Date(cand.getFullYear(), cand.getMonth() + 1, 0).getDate();
    cand.setDate(Math.min(anchor.getDate(), lastDay));
    return toLocalDay(cand);
  }
  return anchor >= ref ? toLocalDay(anchor) : toLocalDay(ref);
}

/** Format a Date as YYYY-MM-DD. */
export function formatDateToYYYYMMDD(d: Date): string {
  const x = toLocalDay(d);
  const y = x.getFullYear();
  const m = String(x.getMonth() + 1).padStart(2, "0");
  const day = String(x.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

/** Start of today in UTC (00:00:00 UTC). Use as reference so server timezone doesn't block advancing past-due dates. */
export function getTodayUTC(): Date {
  const now = new Date();
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
}

/** True if date is within the next 14 days from ref (inclusive: ref through ref+14). */
export function isDueInNextTwoWeeks(date: Date, ref: Date | string = new Date()): boolean {
  const r = typeof ref === "string" ? parseFlexibleDate(ref) : toLocalDay(ref);
  const d = toLocalDay(date);
  if (Number.isNaN(d.getTime()) || Number.isNaN(r.getTime())) return false;
  const days = Math.round((d.getTime() - r.getTime()) / 86_400_000);
  return days >= 0 && days <= 14;
}

/**
 * Next due date on or after reference, advanced by frequency.
 * Returns the next due date string (YYYY-MM-DD) and whether it falls in "this paycheck" window.
 * When paycheckEndDate is provided (e.g. next biweekly pay date), "in this paycheck" = due on or before that date.
 * Otherwise uses a fixed 14-day window from referenceDate.
 * Use getTodayUTC() as referenceDate when computing on the server so dates advance correctly regardless of server timezone.
 */
export function getNextDueAndPaycheck(
  nextDueStr: string,
  frequency: string,
  referenceDate: Date | string = new Date(),
  paycheckEndDate?: Date | null
): { nextDue: string; inThisPaycheck: boolean } {
  const ref = typeof referenceDate === "string" ? parseFlexibleDate(referenceDate) : toLocalDay(referenceDate);
  const biweeklyEnd =
    paycheckEndDate != null && !Number.isNaN(toLocalDay(paycheckEndDate).getTime())
      ? toLocalDay(paycheckEndDate)
      : null;

  // Next due: always advance by frequency from stored date (so 2-week items keep your actual schedule, e.g. last pay Feb 13 → next due Feb 27)
  const next = getNextAutoTransferDate(nextDueStr, frequency, ref);

  if (Number.isNaN(next.getTime())) {
    return { nextDue: (nextDueStr ?? "").trim() || formatDateToYYYYMMDD(ref), inThisPaycheck: false };
  }
  const nextDue = formatDateToYYYYMMDD(next);
  const inThisPaycheck =
    biweeklyEnd != null ? next >= ref && next <= biweeklyEnd : isDueInNextTwoWeeks(next, ref);
  return { nextDue, inThisPaycheck };
}
