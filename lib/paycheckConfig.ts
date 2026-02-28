import type { PaycheckConfig } from "./types";
import {
  getNextPaycheckBiweekly,
  getNextPaycheckMonthly,
  getNextPaycheckLastWorkingDayOfMonth,
  getNextThursdayOnOrAfter,
} from "./paycheckDates";

/**
 * Next biweekly pay date from the biweekly config (prefers one named "Quest" when present).
 * Used to sync "in this paycheck" window with the actual biweekly pay schedule (e.g. Quest Diagnostics).
 */
export function getNextBiweeklyPayDate(
  configs: PaycheckConfig[],
  referenceDate: Date | string = new Date()
): Date | null {
  const biweekly =
    configs.find((c) => c.frequency === "biweekly" && /quest/i.test(c.name ?? "")) ??
    configs.find((c) => c.frequency === "biweekly");
  if (!biweekly?.anchorDate) return null;
  return getNextPaycheckBiweekly(biweekly.anchorDate, referenceDate);
}

/** Fallback configs used when PocketBase has no paycheck records. */
export const defaultPaycheckConfigs: PaycheckConfig[] = [
  {
    id: "default-biweekly",
    name: "Partner A",
    frequency: "biweekly",
    anchorDate: "2026-01-29",
    dayOfMonth: null,
    amount: null,
  },
  {
    id: "default-monthly",
    name: "Partner B",
    frequency: "monthlyLastWorkingDay",
    anchorDate: null,
    dayOfMonth: null,
    amount: null,
  },
];

export interface NextPaycheckInfo {
  id: string;
  name: string;
  nextDate: Date;
  amount: number | null;
  frequency: PaycheckConfig["frequency"];
  anchorDate: string | null;
  fundingMonthPreference?: PaycheckConfig["fundingMonthPreference"];
  lastEditedBy?: string | null;
  lastEditedAt?: string | null;
}

/**
 * Returns the next pay date for each config, on or after `referenceDate`.
 * Falls back to `defaultPaycheckConfigs` when `configs` is empty.
 */
export function getNextPaychecks(
  configs: PaycheckConfig[],
  referenceDate: Date | string = new Date()
): NextPaycheckInfo[] {
  const list = configs.length > 0 ? configs : defaultPaycheckConfigs;
  return list.map((c) => {
    let nextDate: Date;
    if (c.frequency === "biweekly") {
      nextDate = c.anchorDate
        ? getNextPaycheckBiweekly(c.anchorDate, referenceDate)
        : getNextThursdayOnOrAfter(referenceDate);
    } else if (c.frequency === "monthlyLastWorkingDay") {
      nextDate = getNextPaycheckLastWorkingDayOfMonth(referenceDate);
    } else if (c.frequency === "monthly" && c.dayOfMonth != null) {
      nextDate = getNextPaycheckMonthly(c.dayOfMonth, referenceDate);
    } else {
      nextDate = new Date();
    }
    return {
      id: c.id,
      name: c.name,
      nextDate,
      amount: c.amount ?? null,
      frequency: c.frequency,
      anchorDate: c.anchorDate ?? null,
      fundingMonthPreference: c.fundingMonthPreference ?? null,
      lastEditedBy: c.lastEditedBy ?? null,
      lastEditedAt: c.lastEditedAt ?? null,
    };
  });
}
