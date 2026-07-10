/**
 * Bill due-date occurrences for calendar / paycheck windows.
 * Monthly bills use the day-of-month from nextDue in each calendar month (same as Recurring tab).
 */
import { parseFlexibleDate } from "./paycheckDates";

function toYMD(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

/** All due-date occurrences for a bill that fall within a calendar month. */
export function billDatesInMonth(
  bill: { nextDue?: string; frequency?: string },
  year: number,
  month: number
): string[] {
  const first = new Date(year, month, 1);
  const last = new Date(year, month + 1, 0);
  const results: string[] = [];

  if (!bill.nextDue) return results;
  const due = parseFlexibleDate(bill.nextDue);
  if (Number.isNaN(due.getTime())) return results;

  const freq = (bill.frequency ?? "monthly").toLowerCase();
  if (freq === "2weeks") {
    const d = new Date(due.getTime());
    while (d > last) d.setDate(d.getDate() - 14);
    while (d < first) d.setDate(d.getDate() + 14);
    while (d <= last) {
      if (d >= first) results.push(toYMD(d));
      d.setDate(d.getDate() + 14);
    }
  } else if (freq === "yearly") {
    if (due.getMonth() === month && due >= first && due <= last) {
      results.push(toYMD(due));
    }
  } else {
    const day = due.getDate();
    const clampedDay = Math.min(day, last.getDate());
    const d = new Date(year, month, clampedDay);
    results.push(toYMD(d));
  }
  return results;
}

/** Occurrence dates between startYmd and endYmd inclusive (YYYY-MM-DD). */
export function billOccurrenceDatesInRange(
  bill: { nextDue?: string; frequency?: string },
  startYmd: string,
  endYmd: string
): string[] {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(startYmd) || !/^\d{4}-\d{2}-\d{2}$/.test(endYmd)) return [];
  if (!bill.nextDue?.trim()) return [];

  const start = parseFlexibleDate(startYmd);
  const end = parseFlexibleDate(endYmd);
  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime()) || start > end) return [];

  const results: string[] = [];
  const seen = new Set<string>();

  let y = start.getFullYear();
  let m = start.getMonth();
  const endY = end.getFullYear();
  const endM = end.getMonth();

  while (y < endY || (y === endY && m <= endM)) {
    for (const d of billDatesInMonth(bill, y, m)) {
      if (d >= startYmd && d <= endYmd && !seen.has(d)) {
        seen.add(d);
        results.push(d);
      }
    }
    m++;
    if (m > 11) {
      m = 0;
      y++;
    }
  }
  results.sort();
  return results;
}
