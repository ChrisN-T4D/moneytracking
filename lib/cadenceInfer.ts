/**
 * Infer billing cadence from statement date gaps for a recurring pattern.
 */

import type { Cadence } from "./spendTaxonomy";

function parseDate(dateStr: string): Date | null {
  const d = new Date(dateStr);
  if (Number.isNaN(d.getTime())) return null;
  return d;
}

/** Format YYYY-MM-DD for a date at local midnight. */
function toDateOnly(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function daysBetween(a: Date, b: Date): number {
  const msPerDay = 24 * 60 * 60 * 1000;
  const utcA = Date.UTC(a.getFullYear(), a.getMonth(), a.getDate());
  const utcB = Date.UTC(b.getFullYear(), b.getMonth(), b.getDate());
  return Math.round((utcB - utcA) / msPerDay);
}

function fromDateOnly(dateOnly: string): Date {
  const [y, m, day] = dateOnly.split("-").map(Number);
  return new Date(y, m - 1, day);
}

/**
 * Infer cadence from ISO or parseable dates.
 * Avg gap 12–16 days → biweekly; 25–35 → monthly; else variable.
 * Fewer than 2 unique dates → variable.
 */
export function inferCadenceFromDates(dates: string[]): Cadence {
  const uniqueDates = [
    ...new Set(
      dates
        .map(parseDate)
        .filter((d): d is Date => d !== null)
        .map(toDateOnly)
    ),
  ].sort();

  if (uniqueDates.length < 2) return "variable";

  const parsed = uniqueDates.map(fromDateOnly);
  const gaps: number[] = [];
  for (let i = 1; i < parsed.length; i++) {
    gaps.push(daysBetween(parsed[i - 1], parsed[i]));
  }

  const avgGap = gaps.reduce((sum, gap) => sum + gap, 0) / gaps.length;

  if (avgGap >= 12 && avgGap <= 16) return "biweekly";
  if (avgGap >= 25 && avgGap <= 35) return "monthly";
  return "variable";
}
