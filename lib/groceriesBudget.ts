/**
 * Shared Groceries & Gas envelope ($250 / biweekly pay period).
 * Used by Check-In and Analyze so the budget cannot drift.
 */
import type { PaycheckConfig, StatementRecord, StatementTagRule } from "./types";
import { getNextBiweeklyPayDate } from "./paycheckConfig";
import { computeSpentForBillKeysInDateRange } from "./statementTagging";
import { formatDateToYYYYMMDD } from "./paycheckDates";

export const GROCERIES_AND_GAS_PER_PAYCHECK = 250;

export const GROCERIES_AND_GAS_BILL_KEYS = [
  "checking_account|bills|groceries",
  "checking_account|bills|gas",
  "checking_account|bills|groceries & gas",
] as const;

export type GroceriesAndGasPeriod = {
  budget: number;
  spent: number;
  remaining: number;
  periodStartYmd: string | null;
  periodEndYmd: string | null;
};

/**
 * Biweekly groceries/gas spend for the current Quest-style pay period
 * (same window rules as Check-In on app/page.tsx).
 */
export function getGroceriesAndGasForPayPeriod(
  statements: StatementRecord[],
  tagRules: StatementTagRule[],
  configs: PaycheckConfig[],
  today: Date
): GroceriesAndGasPeriod {
  const budget = GROCERIES_AND_GAS_PER_PAYCHECK;
  const todayDay = new Date(today.getFullYear(), today.getMonth(), today.getDate());
  const nextBiweekly = getNextBiweeklyPayDate(configs, today);

  if (!nextBiweekly) {
    return {
      budget,
      spent: 0,
      remaining: budget,
      periodStartYmd: null,
      periodEndYmd: null,
    };
  }

  let periodEnd = new Date(nextBiweekly.getFullYear(), nextBiweekly.getMonth(), nextBiweekly.getDate());
  let periodStart = new Date(periodEnd);
  periodStart.setDate(periodStart.getDate() - 14);

  if (todayDay >= periodEnd) {
    periodStart = new Date(periodEnd);
    periodEnd = new Date(periodEnd);
    periodEnd.setDate(periodEnd.getDate() + 14);
  }

  const canTag = statements.length > 0 && tagRules.length > 0;
  const spent = canTag
    ? computeSpentForBillKeysInDateRange(
        statements,
        tagRules,
        periodStart,
        periodEnd,
        [...GROCERIES_AND_GAS_BILL_KEYS]
      )
    : 0;

  const remaining = Math.max(0, budget - spent);
  return {
    budget,
    spent: Math.round(spent * 100) / 100,
    remaining: Math.round(remaining * 100) / 100,
    periodStartYmd: formatDateToYYYYMMDD(periodStart),
    periodEndYmd: formatDateToYYYYMMDD(periodEnd),
  };
}
