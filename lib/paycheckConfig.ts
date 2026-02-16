import type { PaycheckConfig } from "./types";
import {
  getNextPaycheckBiweekly,
  getNextPaycheckMonthly,
  getNextPaycheckLastWorkingDayOfMonth,
} from "./paycheckDates";

/** Placeholder defaults when PocketBase has no records. Replace with real data in PocketBase. */
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
  name: string;
  nextDate: Date;
  amount: number | null;
  frequency: PaycheckConfig["frequency"];
}

/**
 * Compute next paycheck date for each config.
 * Partner A: every other Thursday (biweekly). Partner B: last working day of month.
 * Uses defaults if configs is empty.
 */
export function getNextPaychecks(
  configs: PaycheckConfig[],
  fromDate: Date = new Date()
): NextPaycheckInfo[] {
  const list = configs.length > 0 ? configs : defaultPaycheckConfigs;
  return list.map((c) => {
    let nextDate: Date;
    if (c.frequency === "biweekly" && c.anchorDate) {
      nextDate = getNextPaycheckBiweekly(new Date(c.anchorDate), fromDate);
    } else if (c.frequency === "monthlyLastWorkingDay") {
      nextDate = getNextPaycheckLastWorkingDayOfMonth(fromDate);
    } else if (c.frequency === "monthly" && c.dayOfMonth != null) {
      nextDate = getNextPaycheckMonthly(c.dayOfMonth, fromDate);
    } else {
      nextDate = fromDate;
    }
    return {
      name: c.name,
      nextDate,
      amount: c.amount ?? null,
      frequency: c.frequency,
    };
  });
}
