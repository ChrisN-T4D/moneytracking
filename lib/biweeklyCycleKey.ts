/**
 * Biweekly paycheck period keys for Recurring "mark paid" (shared; no imports from summaryCalculations).
 */

function toYmd(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

/** Period end P where due falls in [P-14, P] inclusive (date strings). */
export function biweeklyCycleKeyForDue(dueYmd: string, payPeriodEndDates: Date[]): string {
  const ends = [...new Set(payPeriodEndDates.map((d) => toYmd(d)))].sort();
  for (const endStr of ends) {
    const end = new Date(
      Number(endStr.slice(0, 4)),
      Number(endStr.slice(5, 7)) - 1,
      Number(endStr.slice(8, 10))
    );
    const start = new Date(end);
    start.setDate(start.getDate() - 14);
    const startStr = toYmd(start);
    if (dueYmd >= startStr && dueYmd <= endStr) return `b:${endStr}`;
  }
  for (const endStr of ends) {
    if (dueYmd <= endStr) return `b:${endStr}`;
  }
  if (ends.length > 0) return `b:${ends[ends.length - 1]!}`;
  return `b:${dueYmd}`;
}
