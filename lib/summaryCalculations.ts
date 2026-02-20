/**
 * Compute predicted needs and auto-transfer totals for "Current money status".
 * Flow: Paychecks → Checking → auto transfers move to Bills / Spanish Fork (and some stay in Checking).
 */

import type { BillOrSub, AutoTransfer, SpanishForkBill, PaycheckConfig } from "./types";
import { parseFlexibleDate, getNextThursdayOnOrAfter } from "./paycheckDates";

/** Monthly equivalent: monthly = amount, 2weeks = amount * 2, yearly = amount / 12 */
export function monthlyEquivalent(amount: number, frequency: string): number {
  const f = (frequency ?? "").toLowerCase();
  const is2W = f.includes("2") && (f.includes("week") || f.includes("wk"));
  if (is2W) return amount * 2;
  if (f.includes("year")) return amount / 12;
  return amount; // monthly or unknown
}

/** Sum predicted need (monthly equivalent) for a list of bills/subs */
function sumMonthlyNeed(items: { amount: number; frequency: string }[]): number {
  return items.reduce((sum, b) => sum + monthlyEquivalent(b.amount, b.frequency), 0);
}

export interface PredictedNeedByAccount {
  billsAccount: number;
  checkingAccount: number;
  spanishFork: number;
}

/** Predicted need this month by account (from bills + subs + Spanish Fork). */
export function predictedNeedByAccountFromLists(
  billsAccountBills: BillOrSub[],
  billsAccountSubs: BillOrSub[],
  checkingAccountBills: BillOrSub[],
  checkingAccountSubs: BillOrSub[],
  spanishForkBills: SpanishForkBill[]
): PredictedNeedByAccount {
  return {
    billsAccount: sumMonthlyNeed(billsAccountBills) + sumMonthlyNeed(billsAccountSubs),
    checkingAccount: sumMonthlyNeed(checkingAccountBills) + sumMonthlyNeed(checkingAccountSubs),
    spanishFork: sumMonthlyNeed(spanishForkBills),
  };
}

/** Predicted need from PocketBase billsWithMeta + sections (bills_list) + spanishFork list */
export function predictedNeedByAccountFromPb(
  billsWithMeta: { account?: string; listType?: string; amount: number; frequency: string }[],
  spanishForkBills: { amount: number; frequency: string }[]
): PredictedNeedByAccount {
  let billsAccount = 0;
  let checkingAccount = 0;
  for (const b of billsWithMeta) {
    const m = monthlyEquivalent(b.amount, b.frequency);
    if (b.account === "bills_account") billsAccount += m;
    else if (b.account === "checking_account") checkingAccount += m;
  }
  return {
    billsAccount,
    checkingAccount,
    spanishFork: sumMonthlyNeed(spanishForkBills),
  };
}

export interface AutoTransfersMonthlyByAccount {
  bills: number;
  spanishFork: number;
  checking: number;
  /** Total that leaves "main" checking (to Bills + Spanish Fork) */
  outFromChecking: number;
}

/** Auto transfers per destination account, as monthly equivalent. */
export function autoTransfersMonthlyByAccount(transfers: AutoTransfer[]): AutoTransfersMonthlyByAccount {
  let bills = 0;
  let spanishFork = 0;
  let checking = 0;
  for (const t of transfers) {
    const m = monthlyEquivalent(t.amount, t.frequency);
    const account = (t.account ?? "").trim().toLowerCase();
    if (account.includes("bills") || account === "bills") bills += m;
    else if (account.includes("spanish") || account === "spanish fork") spanishFork += m;
    else checking += m; // "Checking" or fun money etc.
  }
  return {
    bills,
    spanishFork,
    checking,
    outFromChecking: bills + spanishFork + checking,
  };
}

/** Last working (weekday) day of any calendar month */
function lastWorkingDayOf(year: number, month: number): Date {
  const d = new Date(year, month + 1, 0); // last calendar day
  if (d.getDay() === 0) d.setDate(d.getDate() - 2); // Sunday → Friday
  else if (d.getDay() === 6) d.setDate(d.getDate() - 1); // Saturday → Friday
  return d;
}

/** All pay dates in a given calendar month for a set of paycheck configs, with amounts.
 *
 * For biweekly: starts from the raw anchorDate (not Thursday-snapped) and walks
 * forward/backward by 14-day steps to land all occurrences in the target month.
 * This correctly handles any day-of-week.
 */
function getPaycheckDatesInMonth(
  configs: PaycheckConfig[],
  year: number,
  month: number
): { date: Date; amount: number }[] {
  const result: { date: Date; amount: number }[] = [];
  const first = new Date(year, month, 1);
  const last = new Date(year, month + 1, 0);

  for (const c of configs) {
    const amount = c.amount ?? 0;

    if (c.frequency === "biweekly") {
      // Use anchorDate if available; fall back to next Thursday from the start of the target month
      // (same fallback used by getNextPaychecks in paycheckConfig.ts)
      const anchorRaw = c.anchorDate ? parseFlexibleDate(c.anchorDate) : null;
      const anchor = anchorRaw && !Number.isNaN(anchorRaw.getTime())
        ? anchorRaw
        : getNextThursdayOnOrAfter(first);
      if (Number.isNaN(anchor.getTime())) continue;

      // Walk anchor forward until it reaches or passes the first day of the month
      const d = new Date(anchor.getFullYear(), anchor.getMonth(), anchor.getDate());
      while (d < first) d.setDate(d.getDate() + 14);
      // It's possible we overshot; walk back if the previous occurrence is also in the month
      // (handles case where anchor is already far ahead)
      while (d > first) {
        const prev = new Date(d.getTime());
        prev.setDate(prev.getDate() - 14);
        if (prev >= first) { d.setDate(d.getDate() - 14); } else break;
      }
      // Collect all occurrences in [first, last]
      while (d <= last) {
        if (d >= first) result.push({ date: new Date(d.getTime()), amount });
        d.setDate(d.getDate() + 14);
      }
    } else if (c.frequency === "monthly" && c.dayOfMonth != null) {
      const clamp = Math.min(c.dayOfMonth, new Date(year, month + 1, 0).getDate());
      const d = new Date(year, month, clamp);
      if (d >= first && d <= last) result.push({ date: d, amount });
    } else if (c.frequency === "monthlyLastWorkingDay") {
      // The last-working-day paycheck at the END of month M covers month M+1.
      // So to find the paycheck that funds the target month, look in the PREVIOUS month.
      const prevMonth = month === 0 ? 11 : month - 1;
      const prevYear = month === 0 ? year - 1 : year;
      const lastWorking = lastWorkingDayOf(prevYear, prevMonth);
      result.push({ date: lastWorking, amount });
    }
  }
  return result;
}

/** Total expected paychecks this month and their dates. */
export function expectedPaychecksThisMonthDetail(
  configs: PaycheckConfig[],
  refDate: Date = new Date()
): { total: number; payDates: { date: Date; amount: number; name: string }[] } {
  const year = refDate.getFullYear();
  const month = refDate.getMonth();
  const payDates: { date: Date; amount: number; name: string }[] = [];
  for (const c of configs) {
    const dates = getPaycheckDatesInMonth([c], year, month);
    for (const d of dates) payDates.push({ ...d, name: c.name ?? "" });
  }
  payDates.sort((a, b) => a.date.getTime() - b.date.getTime());
  return { total: payDates.reduce((s, p) => s + p.amount, 0), payDates };
}

/** Total expected paychecks this month from config amounts (does not use statement actuals). */
export function expectedPaychecksThisMonth(
  configs: PaycheckConfig[],
  refDate: Date = new Date()
): number {
  return expectedPaychecksThisMonthDetail(configs, refDate).total;
}

export interface MoneyStatus {
  /** The month name the status is computed for (e.g. "March") */
  forMonthName: string;
  /** Expected paychecks this month (from config) */
  paychecksThisMonth: number;
  /** Individual pay dates counted */
  payDates: { date: Date; amount: number; name: string }[];
  /** Predicted need per account (from bills) */
  predictedNeed: PredictedNeedByAccount;
  /** Auto transfers in per account (monthly equivalent) */
  autoTransfersIn: AutoTransfersMonthlyByAccount;
  /** Total monthly contributions across all goals */
  totalGoalContributions: number;
  /** Left over: paychecks - auto transfers out - checking predicted need - goal contributions - variableExpensesThisMonth */
  leftOverComputed: number;
  /** Variable expenses this month (tagged as variable_expense); subtracted from left over */
  variableExpensesThisMonth: number;
  /** Breakdown of transactions tagged as variable expenses (for drill-down modal) */
  variableExpensesBreakdown?: { date: string; description: string; amount: number }[];
  /** Manually entered current account balances (from summary record) */
  accountBalances: { checking: number | null; bills: number | null; spanishFork: number | null };
  /** What's actually been paid/transferred this month per account (from tagged statements) */
  paidThisMonth: { checking: number; bills: number; spanishFork: number };
  /** Combined Groceries & Gas subsection (checking): budget from bills, spent from tagged statements */
  subsections?: { groceriesAndGas: { budget: number; spent: number } };
}

export function computeMoneyStatus(
  predictedNeed: PredictedNeedByAccount,
  autoTransfers: AutoTransfersMonthlyByAccount,
  paychecksThisMonth: number,
  payDates: { date: Date; amount: number; name: string }[] = [],
  forMonthName: string = "",
  totalGoalContributions: number = 0,
  accountBalances: { checking: number | null; bills: number | null; spanishFork: number | null } = { checking: null, bills: null, spanishFork: null },
  paidThisMonth: { checking: number; bills: number; spanishFork: number } = { checking: 0, bills: 0, spanishFork: 0 },
  variableExpensesThisMonth: number = 0
): MoneyStatus {
  const leftOverComputed =
    paychecksThisMonth - autoTransfers.outFromChecking - predictedNeed.checkingAccount - totalGoalContributions - variableExpensesThisMonth;
  return {
    forMonthName,
    paychecksThisMonth,
    payDates,
    predictedNeed,
    autoTransfersIn: autoTransfers,
    totalGoalContributions,
    leftOverComputed,
    variableExpensesThisMonth,
    accountBalances,
    paidThisMonth,
  };
}
