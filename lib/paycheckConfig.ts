import type { PaycheckConfig } from "./types";
import {
  getNextPaycheckBiweekly,
  getNextPaycheckMonthly,
  getNextPaycheckLastWorkingDayOfMonth,
  getNextThursdayOnOrAfter,
} from "./paycheckDates";

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
      lastEditedBy: c.lastEditedBy ?? null,
      lastEditedAt: c.lastEditedAt ?? null,
    };
  });
}
