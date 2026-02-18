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

/** Next pay date in a biweekly (every-other-Thursday) series on or after `referenceDate`. */
export function getNextPaycheckBiweekly(
  anchorDate: Date | string,
  referenceDate: Date | string = new Date()
): Date {
  const from = toLocalDay(referenceDate);
  const next = getNextThursdayOnOrAfter(anchorDate);
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

/** Whole calendar days from `from` to `to` (negative when `to` is in the past). */
export function daysUntil(from: Date, to: Date): number {
  return Math.round((toLocalDay(to).getTime() - toLocalDay(from).getTime()) / 86_400_000);
}
