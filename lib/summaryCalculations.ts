/**
 * Compute predicted needs and auto-transfer totals for "Current money status".
 * Flow: Paychecks → Checking → auto transfers move to Bills / Spanish Fork (and some stay in Checking).
 */

import type { BillOrSub, AutoTransfer, SpanishForkBill, PaycheckConfig } from "./types";
import { parseFlexibleDate, getNextThursdayOnOrAfter, getNextAutoTransferDate, getNextDueAndPaycheck, formatDateToYYYYMMDD } from "./paycheckDates";

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

/** A single auto-transfer that has occurred (or is scheduled) so far this month. */
export interface AutoTransferOccurrence {
  whatFor: string;
  account: string;
  amountEach: number;
  count: number;
  total: number;
  dates: string[]; // YYYY-MM-DD strings for each occurrence
  /** "in" = money arriving into a tracked account (bills/spanish fork); "out" = leaving checking to a personal/external account */
  direction: "in" | "out";
}

/** Same shape as AutoTransfersMonthlyByAccount but amounts are "so far this month" (schedule-based). */
export interface AutoTransferredInSoFarByAccount {
  bills: number;
  spanishFork: number;
  checking: number;
  /** Money sent out of checking to personal/external accounts (fun money, etc.) */
  outFromChecking: number;
  details: AutoTransferOccurrence[];
}

function classifyAutoTransferAccount(account: string, whatFor?: string): "bills" | "spanishFork" | "out" {
  const a = (account ?? "").trim().toLowerCase();
  const w = (whatFor ?? "").trim().toLowerCase();
  // Check Spanish Fork first so "Spanish Fork Bills" goes to spanishFork, not bills
  if (a.includes("spanish") || a === "spanish fork" || w.includes("spanish fork")) return "spanishFork";
  if (a.includes("bills") || a === "bills") return "bills";
  return "out"; // personal accounts, fun money, etc. — these leave checking
}

/** Count transfers in a given calendar month (from 1st through endOfMonth or today, whichever is earlier). */
export function autoTransferredInForMonth(
  transfers: AutoTransfer[],
  year: number,
  month: number,
  today: Date
): AutoTransferredInSoFarByAccount {
  const monthStart = new Date(year, month, 1);
  const monthEnd = new Date(year, month + 1, 0);
  const through = today < monthStart ? monthStart : today > monthEnd ? monthEnd : today;
  const result: AutoTransferredInSoFarByAccount = { bills: 0, spanishFork: 0, checking: 0, outFromChecking: 0, details: [] };
  if (through < monthStart) return result;
  for (const t of transfers) {
    const dates: string[] = [];
    let ref = new Date(monthStart.getTime());
    while (ref <= through) {
      const next = getNextAutoTransferDate(t.date ?? "", t.frequency ?? "", ref);
      if (Number.isNaN(next.getTime()) || next > through) break;
      if (next >= monthStart) {
        const y = next.getFullYear();
        const m = String(next.getMonth() + 1).padStart(2, "0");
        const d = String(next.getDate()).padStart(2, "0");
        dates.push(`${y}-${m}-${d}`);
      }
      ref = new Date(next.getTime());
      ref.setDate(ref.getDate() + 1);
    }
    if (dates.length === 0) continue;
    const bucket = classifyAutoTransferAccount(t.account ?? "", t.whatFor ?? "");
    const total = dates.length * t.amount;
    const direction: "in" | "out" = bucket === "out" ? "out" : "in";
    result.details.push({ whatFor: t.whatFor ?? "", account: t.account ?? "", amountEach: t.amount, count: dates.length, total, dates, direction });
    if (bucket === "bills") result.bills += total;
    else if (bucket === "spanishFork") result.spanishFork += total;
    else result.outFromChecking += total;
  }
  return result;
}

/** Count how many times a transfer has occurred from monthStart through today, then sum amount by destination account. */
export function autoTransferredInSoFarThisMonth(
  transfers: AutoTransfer[],
  today: Date
): AutoTransferredInSoFarByAccount {
  return autoTransferredInForMonth(transfers, today.getFullYear(), today.getMonth(), today);
}

export interface NextInflow {
  date: Date;
  amount: number;
}

/** Sum of auto-transfer amounts that have transferredThisCycle into Bills and Spanish Fork. Only adds when the transfer's next occurrence is still after referenceDate (so schedule hasn't counted it yet — avoids double-count). */
export function transferredThisCycleByAccount(
  transfers: AutoTransfer[],
  referenceDate: Date
): { bills: number; spanishFork: number } {
  const ref = new Date(referenceDate.getFullYear(), referenceDate.getMonth(), referenceDate.getDate());
  let bills = 0;
  let spanishFork = 0;
  for (const t of transfers) {
    if (!t.transferredThisCycle) continue;
    const nextDate = getNextAutoTransferDate(t.date ?? "", t.frequency ?? "", ref);
    if (!Number.isNaN(nextDate.getTime()) && nextDate <= ref) continue; // schedule already counted this occurrence
    const bucket = classifyAutoTransferAccount(t.account ?? "", t.whatFor ?? "");
    if (bucket === "bills") bills += t.amount ?? 0;
    else if (bucket === "spanishFork") spanishFork += t.amount ?? 0;
  }
  return { bills, spanishFork };
}

/** Next auto-transfer inflow to Bills and to Spanish Fork on or after referenceDate. Skips transfers that have already gone through this cycle (transferredThisCycle). */
export function getNextAutoTransferInByAccount(
  transfers: AutoTransfer[],
  referenceDate: Date
): { bills: NextInflow | null; spanishFork: NextInflow | null } {
  const ref = new Date(referenceDate.getFullYear(), referenceDate.getMonth(), referenceDate.getDate());
  const billsNext: { date: Date; amount: number }[] = [];
  const sfNext: { date: Date; amount: number }[] = [];
  for (const t of transfers) {
    if (t.transferredThisCycle) continue; // already landed this cycle — don't count as "next"
    const bucket = classifyAutoTransferAccount(t.account ?? "", t.whatFor ?? "");
    if (bucket === "out") continue;
    const next = getNextAutoTransferDate(t.date ?? "", t.frequency ?? "", ref);
    if (Number.isNaN(next.getTime()) || next < ref) continue;
    const nextDay = new Date(next.getFullYear(), next.getMonth(), next.getDate());
    if (bucket === "bills") billsNext.push({ date: nextDay, amount: t.amount });
    else if (bucket === "spanishFork") sfNext.push({ date: nextDay, amount: t.amount });
  }
  const minDateAndSum = (arr: { date: Date; amount: number }[]): NextInflow | null => {
    if (arr.length === 0) return null;
    const minDate = arr.reduce((min, x) => (x.date < min ? x.date : min), arr[0].date);
    const total = arr.filter((x) => x.date.getTime() === minDate.getTime()).reduce((s, x) => s + x.amount, 0);
    return { date: minDate, amount: total };
  };
  return {
    bills: minDateAndSum(billsNext),
    spanishFork: minDateAndSum(sfNext),
  };
}

/** Sum predicted need for items where inThisPaycheck is true (by account). */
export function requiredThisPaycheckByAccountFromBills(
  billsWithMeta: { account?: string; listType?: string; amount: number; frequency: string; inThisPaycheck?: boolean }[],
  spanishForkBills: { amount: number; frequency: string; inThisPaycheck?: boolean }[]
): PredictedNeedByAccount {
  let billsAccount = 0;
  let checkingAccount = 0;
  for (const b of billsWithMeta) {
    if (!b.inThisPaycheck) continue;
    const m = monthlyEquivalent(b.amount, b.frequency);
    if (b.account === "bills_account") billsAccount += m;
    else if (b.account === "checking_account") checkingAccount += m;
  }
  let spanishFork = 0;
  for (const b of spanishForkBills) {
    if (b.inThisPaycheck) spanishFork += monthlyEquivalent(b.amount, b.frequency);
  }
  return { billsAccount, checkingAccount, spanishFork };
}

/** Required total (all accounts) for the 2-week period ending on periodEndDate. Uses periodStart = periodEndDate - 14 days.
 * Sums the single-payment amount for each bill due in the period (not monthly equivalent), so biweekly bills aren't doubled. */
export function requiredForPayPeriodEnd(
  billsWithMeta: { account?: string; nextDue?: string; amount: number; frequency: string }[],
  spanishForkBills: { nextDue?: string; amount: number; frequency: string }[],
  periodEndDate: Date
): number {
  const end = new Date(periodEndDate.getFullYear(), periodEndDate.getMonth(), periodEndDate.getDate());
  const start = new Date(end);
  start.setDate(start.getDate() - 14);
  const startStr = formatDateToYYYYMMDD(start);
  let total = 0;
  for (const b of billsWithMeta) {
    const { inThisPaycheck } = getNextDueAndPaycheck(
      (b.nextDue ?? "").trim() || startStr,
      b.frequency ?? "",
      start,
      end
    );
    if (!inThisPaycheck) continue;
    // One occurrence in this period = b.amount (not monthly equivalent; biweekly would otherwise be 2x)
    if (b.account === "bills_account") total += b.amount;
    else if (b.account === "checking_account") total += b.amount;
  }
  for (const b of spanishForkBills) {
    const { inThisPaycheck } = getNextDueAndPaycheck(
      (b.nextDue ?? "").trim() || startStr,
      b.frequency ?? "",
      start,
      end
    );
    if (inThisPaycheck) total += b.amount;
  }
  return total;
}

/** Last working (weekday) day of any calendar month */
function lastWorkingDayOf(year: number, month: number): Date {
  const d = new Date(year, month + 1, 0); // last calendar day
  if (d.getDay() === 0) d.setDate(d.getDate() - 2); // Sunday → Friday
  else if (d.getDay() === 6) d.setDate(d.getDate() - 1); // Saturday → Friday
  return d;
}

/** For a biweekly pay date, the 14-day period is [payDate, payDate+13]. Returns the month that gets
 * the majority of those days (the "funding month"), or 'split' when exactly 7 days fall in each of two months. */
export function fundingMonthForBiweeklyPayDate(
  payDate: Date
): { year: number; month: number } | "split" {
  const start = new Date(payDate.getFullYear(), payDate.getMonth(), payDate.getDate());
  let inFirst = 0;
  const firstYear = start.getFullYear();
  const firstMonth = start.getMonth();
  for (let i = 0; i < 14; i++) {
    const d = new Date(start);
    d.setDate(d.getDate() + i);
    if (d.getFullYear() === firstYear && d.getMonth() === firstMonth) inFirst++;
  }
  const inSecond = 14 - inFirst;
  if (inFirst > 7) return { year: firstYear, month: firstMonth };
  if (inSecond > 7) {
    const lastDay = new Date(start);
    lastDay.setDate(lastDay.getDate() + 13);
    return { year: lastDay.getFullYear(), month: lastDay.getMonth() };
  }
  return "split";
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
      // Add the pay date just before the month if it funds the month (e.g. Feb 27 for March)
      if (d >= first) {
        const prev = new Date(d.getTime());
        prev.setDate(prev.getDate() - 14);
        if (prev < first) {
          const fundingPrev = fundingMonthForBiweeklyPayDate(new Date(prev.getTime()));
          let addPrev = false;
          if (fundingPrev !== "split") {
            addPrev = fundingPrev.year === year && fundingPrev.month === month;
          } else {
            const pref = c.fundingMonthPreference ?? null;
            const endPrev = new Date(prev.getTime()); endPrev.setDate(endPrev.getDate() + 13);
            const secondHalf = { year: endPrev.getFullYear(), month: endPrev.getMonth() };
            // When split, default to second month (e.g. Feb 27 paycheck shows in March) unless user chose "same_month"
            addPrev = (pref !== "same_month") && secondHalf.year === year && secondHalf.month === month;
          }
          if (addPrev) result.push({ date: new Date(prev.getTime()), amount });
        }
      }
      // Collect all pay dates that fall in the calendar month (so Mar 12 and Mar 26 both show for March)
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
  /** Left over: paychecks - auto transfers out - checking predicted need - goal contributions - variableExpensesThisMonth (recorded only, not expected) */
  leftOverComputed: number;
  /** Variable expenses this month — recorded (tagged) actual only; subtracted from left over (not expected/predicted) */
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

/** Per-paycheck breakdown for the display month (for Income vs Needed chart). */
export interface PaycheckBreakdown {
  payDates: { date: Date; amount: number; name: string }[];
  requiredByPayDate: number[];
  discretionaryByPayDate: number[];
  /** Index into payDates for "this" (next) paycheck, or -1 */
  nextPayDateIndex: number;
  groceriesBudgetPerPaycheck?: number;
}

/** Extra fields added by the page for summary/chart (not from computeMoneyStatus). */
export interface MoneyStatusExtras {
  incomeNextMonth?: number;
  nextMonthName?: string;
  incomeForDisplayMonth?: number;
  actualPaychecksDisplayMonth?: number;
  displayMonthYearMonth?: string;
  projectedNextMonth?: number;
  variableExpensesThisPaycheck?: number;
  requiredThisPaycheckByAccount?: { billsAccount: number; checkingAccount: number; spanishFork: number };
  paidLastMonthByAccount?: { bills: number; checking: number; spanishFork: number };
  autoTransferredInSoFar?: AutoTransferredInSoFarByAccount;
  /** "past_current" = first half of month (show past + current); "current_upcoming" = past halfway (show current + upcoming) */
  tableMode?: "past_current" | "current_upcoming";
  leftMonthName?: string;
  rightMonthName?: string;
  autoInForLeftMonth?: AutoTransferredInSoFarByAccount;
  autoInForRightMonth?: AutoTransferredInSoFarByAccount;
  /** Per-paycheck amounts for display month (chart bar + "this paycheck" callout) */
  paycheckBreakdown?: PaycheckBreakdown;
  /** To-date values for running-balance "Current in account" (when no manual balance). */
  paychecksReceivedToDate?: number;
  groceriesAndGasSpentToDate?: number;
  variableExpensesToDate?: number;
  /** Month extra split evenly across paychecks in display month (for fallback "Extra this paycheck" line). */
  leftoverPerPaycheck?: number;
  /** Extra this paycheck = next paycheck − auto transfers − bills (checking) − goals/variable share; when set, shown as "Extra this paycheck". */
  extraThisPaycheck?: number;
  /** Next paycheck amount (for Checking runway bar yellow segment). */
  nextPaycheckAmount?: number;
  /** Next paycheck date (for display). */
  nextPaycheckDate?: Date;
  /** Next auto-transfer in to Bills (date + amount). */
  nextBillsInflow?: NextInflow | null;
  /** Next auto-transfer in to Spanish Fork (date + amount). */
  nextSpanishForkInflow?: NextInflow | null;
  /** Today's date (for current-date marker in chart). */
  todayDate?: Date;
  /** Upcoming bill due dates (for display in chart). */
  upcomingBills?: { date: string; name: string; amount: number; account?: string }[];
  /** Auto transfers with transferredThisCycle for "this cycle" status section. */
  autoTransfers?: AutoTransfer[];
  /** Extra amount to add to Bills/Spanish Fork balance when transfer marked done this cycle (so predicted amount reflects it). */
  transferredThisCycleBonus?: { bills: number; spanishFork: number };
}

export type MoneyStatusWithExtras = MoneyStatus & MoneyStatusExtras;

/** Result of picking display month and expected paychecks for it (used by page to build money status). */
export interface DisplayMonthDetail {
  displayMonth: Date;
  displayMonthName: string;
  displayNextMonth: Date;
  nextMonthName: string;
  payDates: { date: Date; amount: number; name: string }[];
  paychecksThisMonth: number;
  paychecksDisplayNextMonth: number;
}

/**
 * Choose display month (current or next when all current-month pay dates are past) and return pay dates/totals.
 */
export function getDisplayMonthDetail(
  configs: PaycheckConfig[],
  today: Date
): DisplayMonthDetail {
  const currentMonth = new Date(today.getFullYear(), today.getMonth(), 1);
  const nextMonth = new Date(today.getFullYear(), today.getMonth() + 1, 1);
  const todayDay = new Date(today.getFullYear(), today.getMonth(), today.getDate());
  const { payDates: payDatesCurrent } = expectedPaychecksThisMonthDetail(configs, currentMonth);
  const allCurrentMonthPayDatesPast =
    payDatesCurrent.length > 0 &&
    payDatesCurrent.every((p) => {
      const d = new Date(p.date.getFullYear(), p.date.getMonth(), p.date.getDate());
      return d < todayDay;
    });
  const displayMonth = allCurrentMonthPayDatesPast ? nextMonth : currentMonth;
  const displayMonthName = displayMonth.toLocaleString("en-US", { month: "long" });
  const displayNextMonth = new Date(displayMonth.getFullYear(), displayMonth.getMonth() + 1, 1);
  const nextMonthName = displayNextMonth.toLocaleString("en-US", { month: "long" });
  const { total: paychecksThisMonth, payDates } = expectedPaychecksThisMonthDetail(configs, displayMonth);
  const { total: paychecksDisplayNextMonth } = expectedPaychecksThisMonthDetail(configs, displayNextMonth);
  return {
    displayMonth,
    displayMonthName,
    displayNextMonth,
    nextMonthName,
    payDates,
    paychecksThisMonth,
    paychecksDisplayNextMonth,
  };
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
  /** Recorded (tagged) variable expenses this month only — not expected/predicted */
  variableExpensesThisMonth: number = 0,
  /** When set, use this for left-over (e.g. actual paycheck deposits for the month instead of expected). */
  incomeForLeftOver?: number
): MoneyStatus {
  const income = incomeForLeftOver ?? paychecksThisMonth;
  const leftOverComputed =
    income - autoTransfers.outFromChecking - predictedNeed.checkingAccount - totalGoalContributions - variableExpensesThisMonth;
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
