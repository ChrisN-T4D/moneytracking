/**
 * Paycheck-window snapshot for the Analyze tab (numbers first; model narrates this JSON).
 */
import {
  getPaychecks,
  getBillsWithMeta,
  getAutoTransfers,
  getSpanishForkBills,
  getSummary,
  getStatements,
  getStatementTagRules,
} from "@/lib/pocketbase";
import { defaultPaycheckConfigs } from "@/lib/paycheckConfig";
import {
  formatDateToYYYYMMDD,
  getNextPaydayFromSchedule,
  daysUntil,
} from "@/lib/paycheckDates";
import {
  allPayDatesWithinMonthRadius,
  allPayDatesNearMonth,
  billIncludedForNeededBeforePaycheck,
  requiredThisPaycheckByAccountFromBills,
  collectTransfersLeavingCheckingInRange,
} from "@/lib/summaryCalculations";
import { billOccurrenceDatesInRange } from "@/lib/billOccurrenceDates";
import { effectivePaycheckAmount } from "@/lib/paycheckAmountOverride";
import { makeStatementPattern, suggestTagsForStatements } from "@/lib/statementTagging";
import { isTransferDescription } from "@/lib/statementsAnalysis";
import {
  recurringCycleKeyForExpense,
  isManualRecurringPaidForKey,
} from "@/lib/recurringPaidCycle";
import { resolveIsEssential } from "./billEssential";
import type { StatementRecord } from "@/lib/types";
import { getGroceriesAndGasForPayPeriod } from "./groceriesBudget";
import { buildMoneyHealth, type MoneyHealth } from "./moneyHealth";

export interface AnalyzeSnapshot {
  window: {
    todayYmd: string;
    nextPaydayYmd: string | null;
    nextPaydayLabel: string | null;
    daysUntilPayday: number | null;
  };
  accounts: {
    key: string;
    label: string;
    balance: number | null;
    plannedIn: number;
    plannedOut: number;
    projected: number | null;
    required: number;
  }[];
  paychecksNearWindow: { name: string; date: string; amount: number }[];
  largeUpcomingBills: {
    name: string;
    account: string;
    date: string;
    amount: number;
    isPaid: boolean;
    isEssential: boolean;
  }[];
  /** Optional fields */
  cutCandidates?: AnalyzeSnapshot["largeUpcomingBills"];
  mustPayUpcoming?: AnalyzeSnapshot["largeUpcomingBills"];
  spend?: {
    thisCycleOutflow: number;
    priorCycleOutflow: number;
    topMerchants: Array<{ pattern: string; amount: number; count: number }>;
    byCategory: Array<{ label: string; amount: number }>;
  };
  recurringCandidates?: AnalyzeSnapshot["largeUpcomingBills"];
  cashPictureLines: string[];
  moneyHealth: MoneyHealth;
}

export interface OptionalFields {
  cutCandidates?: AnalyzeSnapshot["largeUpcomingBills"];
  mustPayUpcoming?: AnalyzeSnapshot["largeUpcomingBills"];
  spend?: {
    thisCycleOutflow: number;
    priorCycleOutflow: number;
    topMerchants: Array<{ pattern: string; amount: number; count: number }>;
    byCategory: Array<{ label: string; amount: number }>;
  };
  recurringCandidates?: AnalyzeSnapshot["largeUpcomingBills"];
}

function buildAnalyzeSnapshot(): AnalyzeSnapshot {
  // ... existing code ...

  const groceries = getGroceriesAndGasForPayPeriod(statements, tagRules, configs, today);
  const moneyHealth = buildMoneyHealth({
    accounts,
    groceries,
    nextPaydayLabel,
    dataNotes,
  });

  return {
    window: {
      todayYmd,
      nextPaydayYmd,
      nextPaydayLabel,
      daysUntilPayday,
    },
    accounts,
    paychecksNearWindow: paychecksNearWindow.sort((a, b) => a.date.localeCompare(b.date)),
    largeUpcomingBills: largeUpcoming.slice(0, 20),
    mustPayUpcoming: largeUpcoming
      .filter((b) => b.isEssential && !b.isPaid)
      .slice(0, 15)
      .map(({ name, account, date, amount, isPaid }) => ({ name, account, date, amount, isPaid })),
    cutCandidates: [
      ...recurringCandidates
        .filter((r) => !r.isEssential)
        .slice(0, 20)
        .map((r) => ({
          name: r.name,
          amount: r.amount,
          monthlyEquivalent: r.monthlyEquivalent,
          frequency: r.frequency,
          dueInWindow: r.dueInWindow,
          source: r.source,
        })),
      ...largeUpcoming
        .filter((b) => !b.isEssential && !b.isPaid)
        .slice(0, 10)
        .map((b) => ({
          name: b.name,
          amount: b.amount,
          monthlyEquivalent: b.amount,
          frequency: null,
          dueInWindow: true,
          source: "subscription_bill" as const,
        })),
    ].slice(0, 25),
    spend: {
      thisCycleOutflow: Math.round(thisSpend.total * 100) / 100,
      priorCycleOutflow: Math.round(priorSpend.total * 100) / 100,
      topMerchants,
      byCategory,
    },
    recurringCandidates: recurringCandidates.slice(0, 25),
    cashPictureLines,
    moneyHealth,
    dataNotes,
  };
}
