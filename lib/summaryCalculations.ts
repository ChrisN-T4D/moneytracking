/**
 * Compute predicted needs and auto-transfer totals for "Current money status".
 * Flow: Paychecks → Checking → auto transfers move to Bills / Spanish Fork (and some stay in Checking).
 */

import type { BillOrSub, AutoTransfer, SpanishForkBill, PaycheckConfig } from "./types";
import { normalizeKeyForGrouping } from "./pocketbase";
import { effectivePaycheckAmount, hasActivePaycheckAmountOverride } from "./paycheckAmountOverride";
import { billOccurrenceDatesInRange } from "./billOccurrenceDates";
import { parseFlexibleDate, getNextThursdayOnOrAfter, getNextAutoTransferDate, getNextDueAndPaycheck, formatDateToYYYYMMDD } from "./paycheckDates";

/** Same bill can exist twice in PocketBase (e.g. checking "bills" + "subscriptions" lists); merge for paycheck need math. */
function paycheckNeedKey(account: string, name: string): string {
  return `${account}|${normalizeKeyForGrouping(name)}`;
}

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
  billsWithMeta: { account?: string; listType?: string; name?: string; amount: number; frequency: string }[],
  spanishForkBills: { name?: string; amount: number; frequency: string }[]
): PredictedNeedByAccount {
  const mergedBills = new Map<string, { account: string; amount: number; frequency: string }>();
  for (const b of billsWithMeta) {
    const account = (b.account ?? "").trim();
    const name = (b.name ?? "").trim() || "Bill";
    const k = paycheckNeedKey(account, name);
    const prev = mergedBills.get(k);
    const amt = Number(b.amount) || 0;
    if (prev) prev.amount += amt;
    else mergedBills.set(k, { account, amount: amt, frequency: b.frequency });
  }
  let billsAccount = 0;
  let checkingAccount = 0;
  for (const row of mergedBills.values()) {
    const m = monthlyEquivalent(row.amount, row.frequency);
    if (row.account === "bills_account") billsAccount += m;
    else if (row.account === "checking_account") checkingAccount += m;
  }
  const mergedSf = new Map<string, { amount: number; frequency: string }>();
  for (const b of spanishForkBills) {
    const k = normalizeKeyForGrouping((b.name ?? "").trim() || "Bill");
    const prev = mergedSf.get(k);
    const amt = Number(b.amount) || 0;
    if (prev) prev.amount += amt;
    else mergedSf.set(k, { amount: amt, frequency: b.frequency });
  }
  let spanishFork = 0;
  for (const row of mergedSf.values()) {
    spanishFork += monthlyEquivalent(row.amount, row.frequency);
  }
  return {
    billsAccount,
    checkingAccount,
    spanishFork,
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

/** Upcoming transfer-out from Checking (to Bills or Spanish Fork) in the date range [fromDate, toDate]. Used for chart "Out" list. */
export interface UpcomingTransferOut {
  date: Date;
  name: string;
  amount: number;
}

/** All scheduled transfers that leave joint checking in [fromDate, toDate] (every occurrence). */
export function collectTransfersLeavingCheckingInRange(
  transfers: AutoTransfer[],
  fromDate: Date,
  toDate: Date,
  options?: { funMoney?: boolean }
): { details: UpcomingTransferOut[]; total: number } {
  const from = new Date(fromDate.getFullYear(), fromDate.getMonth(), fromDate.getDate());
  const to = new Date(toDate.getFullYear(), toDate.getMonth(), toDate.getDate());
  const includeFunMoney = options?.funMoney !== false;
  const details: UpcomingTransferOut[] = [];

  for (const t of transfers) {
    if (t.transferredThisCycle) continue;
    const bucket = classifyAutoTransferAccount(t.account ?? "", t.whatFor ?? "");
    if (bucket === "out" && !includeFunMoney) continue;
    if (bucket !== "bills" && bucket !== "spanishFork" && bucket !== "out") continue;

    let ref = new Date(from.getTime());
    while (ref <= to) {
      const next = getNextAutoTransferDate(t.date ?? "", t.frequency ?? "", ref);
      if (Number.isNaN(next.getTime()) || next > to) break;
      if (next >= from) {
        details.push({
          date: new Date(next.getFullYear(), next.getMonth(), next.getDate()),
          name: t.whatFor ?? "Transfer",
          amount: t.amount ?? 0,
        });
      }
      ref = new Date(next.getTime());
      ref.setDate(ref.getDate() + 1);
    }
  }
  details.sort((a, b) => a.date.getTime() - b.date.getTime());
  return { details, total: details.reduce((s, x) => s + x.amount, 0) };
}

export function getUpcomingTransfersOutOfChecking(
  transfers: AutoTransfer[],
  fromDate: Date,
  toDate: Date
): UpcomingTransferOut[] {
  return collectTransfersLeavingCheckingInRange(transfers, fromDate, toDate, {
    funMoney: false,
  }).details;
}

/** Bill names that are variable/discretionary (groceries & gas budget) — excluded from "needed before next paycheck". */
const VARIABLE_BILL_NAMES = new Set(
  ["variable expenses", "groceries & gas", "groceries", "gas"].map((s) => s.toLowerCase())
);

function isVariableOrGroceriesBill(name: string | undefined): boolean {
  const n = (name ?? "").trim().toLowerCase();
  return n.length > 0 && VARIABLE_BILL_NAMES.has(n);
}

/** Context for paycheck-window bill filtering (reference = today for "today through next payday"). */
export type PaycheckNeededContext = {
  referenceDate?: Date;
};

function todayYmdFromReference(referenceDate: Date): string {
  const d = new Date(referenceDate.getFullYear(), referenceDate.getMonth(), referenceDate.getDate());
  return formatDateToYYYYMMDD(d);
}

/**
 * Whether a bill counts for "needed before next paycheck".
 * Only bills with nextDue from today through next payday (inclusive).
 */
export function billIncludedForNeededBeforePaycheck(
  bill: {
    nextDue?: string;
    inThisPaycheck?: boolean;
    frequency?: string;
    recurringPaidCycle?: string | null;
  },
  nextPaydayYmd: string | null | undefined,
  context?: PaycheckNeededContext
): boolean {
  if (!nextPaydayYmd) return bill.inThisPaycheck ?? false;

  const todayYmd = todayYmdFromReference(context?.referenceDate ?? new Date());
  const occurrences = billOccurrenceDatesInRange(bill, todayYmd, nextPaydayYmd);
  return occurrences.length > 0;
}

/** Whether a calendar date (YYYY-MM-DD) falls from today through next payday inclusive. */
export function isDateInPaycheckWindow(
  dateYmd: string,
  nextPaydayYmd: string | null | undefined,
  referenceDate?: Date
): boolean {
  if (!nextPaydayYmd) return true;
  const todayYmd = todayYmdFromReference(referenceDate ?? new Date());
  return dateYmd >= todayYmd && dateYmd <= nextPaydayYmd;
}

/** Sum predicted need for items where inThisPaycheck is true (by account).
 * Excludes variable/groceries & gas bills so the $250 budget is not counted as "needed".
 * Uses each line's payment amount (not monthlyEquivalent): a 2-week bill due this period is one payment,
 * same window logic as requiredForPayPeriodEnd / getNextDueAndPaycheck. */
export function requiredThisPaycheckByAccountFromBills(
  billsWithMeta: {
    account?: string;
    listType?: string;
    name?: string;
    amount: number;
    frequency: string;
    nextDue?: string;
    inThisPaycheck?: boolean;
    recurringPaidCycle?: string | null;
    paycheckAmountOverride?: number | null;
    paycheckAmountOverrideFor?: string | null;
  }[],
  spanishForkBills: {
    name?: string;
    amount: number;
    frequency: string;
    nextDue?: string;
    inThisPaycheck?: boolean;
    recurringPaidCycle?: string | null;
    paycheckAmountOverride?: number | null;
    paycheckAmountOverrideFor?: string | null;
  }[],
  nextPaydayYmd?: string | null,
  context?: PaycheckNeededContext
): PredictedNeedByAccount {
  const mergedChecking = new Map<string, number>();
  const mergedBills = new Map<string, number>();
  const todayYmd = todayYmdFromReference(context?.referenceDate ?? new Date());
  for (const b of billsWithMeta) {
    if (!billIncludedForNeededBeforePaycheck(b, nextPaydayYmd, context)) continue;
    if (b.account === "checking_account" && isVariableOrGroceriesBill(b.name)) continue;
    const occCount =
      nextPaydayYmd != null
        ? billOccurrenceDatesInRange(b, todayYmd, nextPaydayYmd).length
        : 1;
    const m = effectivePaycheckAmount(b, nextPaydayYmd) * occCount;
    const name = (b.name ?? "").trim() || "Bill";
    if (b.account === "bills_account") {
      const k = paycheckNeedKey("bills_account", name);
      mergedBills.set(k, (mergedBills.get(k) ?? 0) + m);
    } else if (b.account === "checking_account") {
      const k = paycheckNeedKey("checking_account", name);
      mergedChecking.set(k, (mergedChecking.get(k) ?? 0) + m);
    }
  }
  const billsAccount = [...mergedBills.values()].reduce((s, v) => s + v, 0);
  const checkingAccount = [...mergedChecking.values()].reduce((s, v) => s + v, 0);

  const mergedSf = new Map<string, number>();
  for (const b of spanishForkBills) {
    if (!billIncludedForNeededBeforePaycheck(b, nextPaydayYmd, context)) continue;
    const occCount =
      nextPaydayYmd != null
        ? billOccurrenceDatesInRange(b, todayYmd, nextPaydayYmd).length
        : 1;
    const name = (b.name ?? "").trim() || "Bill";
    const k = normalizeKeyForGrouping(name);
    mergedSf.set(k, (mergedSf.get(k) ?? 0) + effectivePaycheckAmount(b, nextPaydayYmd) * occCount);
  }
  const spanishFork = [...mergedSf.values()].reduce((s, v) => s + v, 0);
  return { billsAccount, checkingAccount, spanishFork };
}

/** Per-account lists of recurring items that make up "needed before next paycheck". */
export type NeededBeforePaycheckLine = {
  name: string;
  amount: number;
  defaultAmount: number;
  hasOverride: boolean;
};

export function getNeededBeforeNextPaycheckBreakdown(
  billsWithMeta: {
    account?: string;
    name?: string;
    amount: number;
    frequency: string;
    nextDue?: string;
    inThisPaycheck?: boolean;
    recurringPaidCycle?: string | null;
    paycheckAmountOverride?: number | null;
    paycheckAmountOverrideFor?: string | null;
  }[],
  spanishForkBills: {
    name?: string;
    amount: number;
    frequency: string;
    nextDue?: string;
    inThisPaycheck?: boolean;
    recurringPaidCycle?: string | null;
    paycheckAmountOverride?: number | null;
    paycheckAmountOverrideFor?: string | null;
  }[],
  nextPaydayYmd?: string | null,
  context?: PaycheckNeededContext
): {
  checkingAccount: NeededBeforePaycheckLine[];
  billsAccount: NeededBeforePaycheckLine[];
  spanishFork: NeededBeforePaycheckLine[];
} {
  type Line = NeededBeforePaycheckLine;
  const todayYmd = todayYmdFromReference(context?.referenceDate ?? new Date());
  const mergeMap = (
    target: Map<string, Line>,
    account: "bills_account" | "checking_account",
    name: string,
    bill: {
      amount: number;
      frequency?: string;
      nextDue?: string;
      paycheckAmountOverride?: number | null;
      paycheckAmountOverrideFor?: string | null;
    },
    occCount: number
  ) => {
    const k = paycheckNeedKey(account, name);
    const effective = effectivePaycheckAmount(bill, nextPaydayYmd) * occCount;
    const defaultAmt = (Number(bill.amount) || 0) * occCount;
    const overridden = hasActivePaycheckAmountOverride(bill, nextPaydayYmd);
    const prev = target.get(k);
    if (prev) {
      prev.amount += effective;
      prev.defaultAmount += defaultAmt;
      prev.hasOverride = prev.hasOverride || overridden;
    } else {
      target.set(k, { name, amount: effective, defaultAmount: defaultAmt, hasOverride: overridden });
    }
  };
  const checkingM = new Map<string, Line>();
  const billsM = new Map<string, Line>();
  for (const b of billsWithMeta) {
    if (!billIncludedForNeededBeforePaycheck(b, nextPaydayYmd, context)) continue;
    if (b.account === "checking_account" && isVariableOrGroceriesBill(b.name)) continue;
    const occCount =
      nextPaydayYmd != null
        ? billOccurrenceDatesInRange(b, todayYmd, nextPaydayYmd).length
        : 1;
    const name = (b.name ?? "").trim() || "Bill";
    if (b.account === "bills_account") mergeMap(billsM, "bills_account", name, b, occCount);
    else if (b.account === "checking_account") mergeMap(checkingM, "checking_account", name, b, occCount);
  }
  const spanishM = new Map<string, Line>();
  for (const b of spanishForkBills) {
    if (!billIncludedForNeededBeforePaycheck(b, nextPaydayYmd, context)) continue;
    const occCount =
      nextPaydayYmd != null
        ? billOccurrenceDatesInRange(b, todayYmd, nextPaydayYmd).length
        : 1;
    const name = (b.name ?? "").trim() || "Bill";
    const k = normalizeKeyForGrouping(name);
    const effective = effectivePaycheckAmount(b, nextPaydayYmd) * occCount;
    const defaultAmt = (Number(b.amount) || 0) * occCount;
    const overridden = hasActivePaycheckAmountOverride(b, nextPaydayYmd);
    const prev = spanishM.get(k);
    if (prev) {
      prev.amount += effective;
      prev.defaultAmount += defaultAmt;
      prev.hasOverride = prev.hasOverride || overridden;
    } else {
      spanishM.set(k, { name, amount: effective, defaultAmount: defaultAmt, hasOverride: overridden });
    }
  }
  return {
    checkingAccount: [...checkingM.values()],
    billsAccount: [...billsM.values()],
    spanishFork: [...spanishM.values()],
  };
}

/** Required total (all accounts) for the 2-week period ending on periodEndDate. Uses periodStart = periodEndDate - 14 days.
 * Sums the single-payment amount for each bill due in the period (not monthly equivalent). Excludes variable/groceries & gas. */
export function requiredForPayPeriodEnd(
  billsWithMeta: {
    account?: string;
    name?: string;
    nextDue?: string;
    amount: number;
    frequency: string;
    recurringPaidCycle?: string | null;
  }[],
  spanishForkBills: {
    name?: string;
    nextDue?: string;
    amount: number;
    frequency: string;
    recurringPaidCycle?: string | null;
  }[],
  periodEndDate: Date,
  payPeriodEndDates?: Date[] | null
): number {
  const end = new Date(periodEndDate.getFullYear(), periodEndDate.getMonth(), periodEndDate.getDate());
  const start = new Date(end);
  start.setDate(start.getDate() - 14);
  const startStr = formatDateToYYYYMMDD(start);
  const mergedBills = new Map<string, number>();
  const mergedChecking = new Map<string, number>();
  const mergedSf = new Map<string, number>();
  for (const b of billsWithMeta) {
    if (b.account === "checking_account" && isVariableOrGroceriesBill(b.name)) continue;
    const ctx = {
      recurringPaidCycle: b.recurringPaidCycle ?? null,
      payPeriodEndDates: payPeriodEndDates ?? undefined,
    };
    const { inThisPaycheck } = getNextDueAndPaycheck(
      (b.nextDue ?? "").trim() || startStr,
      b.frequency ?? "",
      start,
      end,
      ctx
    );
    if (!inThisPaycheck) continue;
    const name = (b.name ?? "").trim() || "Bill";
    const amt = Number(b.amount) || 0;
    if (b.account === "bills_account") {
      const k = paycheckNeedKey("bills_account", name);
      mergedBills.set(k, (mergedBills.get(k) ?? 0) + amt);
    } else if (b.account === "checking_account") {
      const k = paycheckNeedKey("checking_account", name);
      mergedChecking.set(k, (mergedChecking.get(k) ?? 0) + amt);
    }
  }
  for (const b of spanishForkBills) {
    const ctx = {
      recurringPaidCycle: b.recurringPaidCycle ?? null,
      payPeriodEndDates: payPeriodEndDates ?? undefined,
    };
    const { inThisPaycheck } = getNextDueAndPaycheck(
      (b.nextDue ?? "").trim() || startStr,
      b.frequency ?? "",
      start,
      end,
      ctx
    );
    if (!inThisPaycheck) continue;
    const k = normalizeKeyForGrouping((b.name ?? "").trim() || "Bill");
    mergedSf.set(k, (mergedSf.get(k) ?? 0) + (Number(b.amount) || 0));
  }
  let total = 0;
  for (const v of mergedBills.values()) total += v;
  for (const v of mergedChecking.values()) total += v;
  for (const v of mergedSf.values()) total += v;
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

/** Pay dates in the previous, current, and next calendar months (for biweekly window lookup). */
export function allPayDatesNearMonth(
  configs: PaycheckConfig[],
  year: number,
  month: number
): { date: Date; amount: number; name: string }[] {
  const triple: { y: number; m: number }[] =
    month === 0
      ? [{ y: year - 1, m: 11 }, { y: year, m: 0 }, { y: year, m: 1 }]
      : month === 11
        ? [{ y: year, m: 10 }, { y: year, m: 11 }, { y: year + 1, m: 0 }]
        : [{ y: year, m: month - 1 }, { y: year, m: month }, { y: year, m: month + 1 }];

  const payDates: { date: Date; amount: number; name: string }[] = [];
  for (const { y, m } of triple) {
    for (const c of configs) {
      const dates = getPaycheckDatesInMonth([c], y, m);
      for (const d of dates) payDates.push({ ...d, name: c.name ?? "" });
    }
  }
  payDates.sort((a, b) => a.date.getTime() - b.date.getTime());
  return payDates;
}

/** All pay dates in `centerMonth ± monthRadius` (local calendar months) for schedule-based bill windows. */
export function allPayDatesWithinMonthRadius(
  configs: PaycheckConfig[],
  centerYear: number,
  centerMonth: number,
  monthRadius: number
): Date[] {
  const out: Date[] = [];
  for (let i = -monthRadius; i <= monthRadius; i++) {
    const d = new Date(centerYear, centerMonth + i, 1);
    const y = d.getFullYear();
    const m = d.getMonth();
    for (const c of configs) {
      const dates = getPaycheckDatesInMonth([c], y, m);
      for (const x of dates) out.push(new Date(x.date.getTime()));
    }
  }
  out.sort((a, b) => a.getTime() - b.getTime());
  return out;
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
  /** Transfers out of Checking (to Bills/SF) in this paycheck window (for chart "Out" list). */
  upcomingTransfersOutOfChecking?: UpcomingTransferOut[];
  /** All transfers leaving checking until next paycheck (includes fun money; every schedule hit in window). */
  transfersOutUntilNextPaycheck?: number;
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
