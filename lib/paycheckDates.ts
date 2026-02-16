/**
 * Next paycheck date for biweekly (every 2 weeks).
 * anchorDate: any past or future pay date in the series.
 */
export function getNextPaycheckBiweekly(
  anchorDate: Date,
  fromDate: Date = new Date()
): Date {
  const anchor = new Date(anchorDate);
  const from = new Date(fromDate);
  anchor.setHours(0, 0, 0, 0);
  from.setHours(0, 0, 0, 0);
  const next = new Date(anchor);
  while (next < from) {
    next.setDate(next.getDate() + 14);
  }
  return next;
}

function getDaysInMonth(d: Date): number {
  return new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate();
}

/**
 * Last weekday (Mon–Fri) of the given month.
 */
function getLastWorkingDayOfMonth(year: number, month: number): Date {
  const lastDay = new Date(year, month + 1, 0);
  const d = lastDay.getDay();
  if (d === 0) lastDay.setDate(lastDay.getDate() - 2);
  else if (d === 6) lastDay.setDate(lastDay.getDate() - 1);
  return lastDay;
}

/**
 * Next paycheck date for "last working day of month".
 */
export function getNextPaycheckLastWorkingDayOfMonth(
  fromDate: Date = new Date()
): Date {
  const from = new Date(fromDate);
  from.setHours(0, 0, 0, 0);
  const thisMonth = getLastWorkingDayOfMonth(from.getFullYear(), from.getMonth());
  if (thisMonth >= from) return thisMonth;
  return getLastWorkingDayOfMonth(from.getFullYear(), from.getMonth() + 1);
}

/**
 * Next paycheck date for monthly (same day each month).
 * dayOfMonth: 1–31; if month has fewer days, uses last day (e.g. 30 → Feb 28).
 */
export function getNextPaycheckMonthly(
  dayOfMonth: number,
  fromDate: Date = new Date()
): Date {
  const from = new Date(fromDate);
  from.setHours(0, 0, 0, 0);
  const thisMonth = new Date(from.getFullYear(), from.getMonth(), Math.min(dayOfMonth, getDaysInMonth(from)));
  if (thisMonth >= from) return thisMonth;
  const nextMonth = new Date(from.getFullYear(), from.getMonth() + 1, 1);
  const day = Math.min(dayOfMonth, getDaysInMonth(nextMonth));
  return new Date(nextMonth.getFullYear(), nextMonth.getMonth(), day);
}

export function formatDateShort(d: Date): string {
  return d.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

export function daysUntil(from: Date, to: Date): number {
  const a = new Date(from);
  const b = new Date(to);
  a.setHours(0, 0, 0, 0);
  b.setHours(0, 0, 0, 0);
  return Math.round((b.getTime() - a.getTime()) / (1000 * 60 * 60 * 24));
}
