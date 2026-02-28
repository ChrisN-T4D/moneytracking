/**
 * Analyze statement records to suggest paychecks and auto_transfers for the main page.
 * Paychecks: deposits that look like payroll (Gusto, Direct Deposit, Pershing, etc.).
 * Auto-transfers: recurring transfers to/from Neu C (Tithing, Bills, Way2Save, etc.).
 */

import type { StatementRecord } from "./types";

/** Deposit descriptions we treat as paychecks. */
const PAYCHECK_DESCRIPTIONS = [
  /gusto\s*payroll/i,
  /direct\s*deposit/i,
  /dir\s*dep/i,
  /pershing\s*brokerage/i,
  /payroll/i,
  /pay\s*con/i,
  /integris\s*health/i,
  /quest\s*diagnos/i, // Quest Diagnostic, Quest Diagnostics, etc.
  /nwosu/i,          // NWOSU Payroll, Nwosu Payroll Payroll, etc.
];

function isPaycheckLike(description: string): boolean {
  return PAYCHECK_DESCRIPTIONS.some((re) => re.test(description));
}

/** Recurring transfer descriptions we treat as auto_transfers (whatFor). */
const AUTO_TRANSFER_FROM = [
  { re: /recurring\s*transfer\s*from\s*neu\s+c.*tithing/i, whatFor: "Tithing (from Checking)" },
  { re: /recurring\s*transfer\s*from\s*neu\s+c.*everyday\s*checking\s+tithing/i, whatFor: "Tithing Every Week" },
  { re: /online\s*transfer\s*from\s*neu\s+c.*way2save.*northwestern/i, whatFor: "Northwestern (Way2Save)" },
  { re: /online\s*transfer\s*from\s*neu\s+c.*way2save.*mortgage|cover\s*mortgage/i, whatFor: "Cover Mortgage" },
  { re: /online\s*transfer\s*from\s*neu\s+c.*way2save.*voice\s*lesson/i, whatFor: "Voice Lesson" },
  { re: /online\s*transfer\s*from\s*neu\s+c.*way2save.*zero\s*balance/i, whatFor: "Zero Balance" },
  { re: /online\s*transfer\s*from\s*neu\s+c.*way2save.*walmart\s*plus/i, whatFor: "Walmart Plus" },
  { re: /online\s*transfer\s*from\s*neu\s+c.*way2save.*tithing/i, whatFor: "Tithing Babysitting and Piano" },
  { re: /online\s*transfer\s*from\s*neu\s+c.*everyday\s*checking/i, whatFor: "From Everyday Checking" },
];
const AUTO_TRANSFER_TO = [
  { re: /recurring\s*transfer\s*to\s*neu\s+c.*tithing\s*every\s*week/i, whatFor: "Tithing Every Week" },
  { re: /recurring\s*transfer\s*to\s*neu\s+c.*one\s*eighth\s*of\s*bills/i, whatFor: "One Eighth of Bills" },
  { re: /online\s*transfer\s*to\s*neu\s+c.*way2save.*bills/i, whatFor: "Bills" },
  { re: /online\s*transfer\s*to\s*neu\s+c.*way2save.*venmo/i, whatFor: "Venmo From Kerrie to Right Place" },
];

/** True if the statement description looks like a transfer (not a bill/expense) — exclude from "Add items to bills" and "paid this month". */
export function isTransferDescription(description: string): boolean {
  const d = (description ?? "").trim();
  if (!d) return false;

  // Specific known auto-transfer patterns
  for (const { re } of [...AUTO_TRANSFER_FROM, ...AUTO_TRANSFER_TO]) {
    if (re.test(d)) return true;
  }

  // Recurring / online transfer to/from an account
  if (/(recurring|online)\s*transfer\s*(from|to)/i.test(d)) return true;
  if (/transfer\s*(from|to)\s*neu\s*c/i.test(d)) return true;

  // "ONLINE TRANSFER REF …" — Wells Fargo outgoing transfers (bill pay, credit card payments, etc.)
  if (/online\s*transfer\s*ref\b/i.test(d)) return true;

  // Venmo * NAME payments (e.g. "TRANSFER AUTHORIZED ON 02/15 VENMO * RACHEL DEMILLE CA")
  // These are person-to-person expenses the user may want to tag as specific bills — let them through.
  if (/VENMO\s*\*/i.test(d)) return false;

  // "MONEY TRANSFER AUTHORIZED" — wire, P2P payments (excluding Venmo * above)
  if (/money\s*transfer\s*authorized/i.test(d)) return true;

  // Any bank wire / ACH transfer keyword
  // Note: "ACH DEBIT" is NOT filtered — it's how banks label outgoing bill payments
  // (utilities, cable, insurance, etc.), NOT internal account-to-account transfers.
  if (/\bwire\s*transfer\b/i.test(d)) return true;
  if (/\bACH\s*(transfer|credit)\b/i.test(d)) return true;

  // Goldman Sachs savings transfers ("GOLDMAN SACHS BA TRANSFER …")
  if (/goldman\s*sachs\b.*transfer/i.test(d)) return true;
  if (/transfer\b.*goldman\s*sachs/i.test(d)) return true;

  // Generic "TRANSFER AUTHORIZED ON" (Zelle, etc. — Venmo * already handled above)
  if (/transfer\s*authorized\s*on\b/i.test(d)) return true;

  // Credit card payment transfers
  if (/payment\s*to\s*(credit\s*card|visa|mastercard|amex|discover)/i.test(d)) return true;

  return false;
}

/** Parse date string to milliseconds for ordering. Handles YYYY-MM-DD and M/D/YYYY. */
function parseDateToTime(d: string): number {
  return new Date(d.trim()).getTime();
}

/** Return YYYY-MM-DD for the latest date in the list (by actual time), so "last date" is correct regardless of string format. Uses UTC date components so stored ISO dates (UTC midnight) do not shift to the previous day in local time. */
function latestDateString(dates: string[]): string {
  if (dates.length === 0) return "";
  const withTime = dates.map((d) => ({ str: d.trim(), t: parseDateToTime(d) }));
  withTime.sort((a, b) => a.t - b.t);
  const last = withTime[withTime.length - 1]!;
  if (Number.isNaN(last.t)) return last.str;
  const date = new Date(last.t);
  const y = date.getUTCFullYear();
  const m = String(date.getUTCMonth() + 1).padStart(2, "0");
  const day = String(date.getUTCDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function inferFrequency(dates: string[]): "biweekly" | "monthly" | "monthlyLastWorkingDay" {
  if (dates.length < 2) return "biweekly";
  const parsed = dates.map((d) => parseDateToTime(d)).filter((t) => !Number.isNaN(t)).sort((a, b) => a - b);
  if (parsed.length < 2) return "biweekly";
  const gaps: number[] = [];
  for (let i = 1; i < parsed.length; i++) gaps.push((parsed[i]! - parsed[i - 1]!) / (24 * 60 * 60 * 1000));
  const avgGap = gaps.reduce((a, b) => a + b, 0) / gaps.length;
  if (avgGap >= 25 && avgGap <= 32) return "monthly";
  if (avgGap >= 28 && avgGap <= 31) return "monthlyLastWorkingDay";
  return "biweekly";
}

function inferPaycheckName(description: string): string {
  if (/gusto/i.test(description)) return "Gusto Payroll";
  if (/integris\s*health/i.test(description)) return "Integris Health";
  if (/pershing/i.test(description)) return "Pershing (Brokerage)";
  if (/quest\s*diagnos/i.test(description)) return "Quest Diagnostic (Deposit)";
  if (/direct\s*dep|dir\s*dep/i.test(description)) return "Direct Deposit";
  return description.slice(0, 40).trim() || "Paycheck";
}

export interface SuggestedPaycheck {
  name: string;
  frequency: "biweekly" | "monthly" | "monthlyLastWorkingDay";
  anchorDate: string;
  amount: number;
  count: number;
  lastDate: string;
}

export interface SuggestedAutoTransfer {
  whatFor: string;
  frequency: string;
  account: string;
  date: string;
  amount: number;
  count: number;
}

/** Section + listType to match main page (Bills (Bills Account), Subscriptions (Bills Account), etc.). */
export type BillSuggestedGroup = {
  section: "bills_account" | "checking_account" | "spanish_fork";
  listType: "bills" | "subscriptions";
};

export interface SuggestedBill {
  name: string;
  frequency: "2weeks" | "monthly" | "yearly";
  amount: number;
  count: number;
  lastDate: string;
  /** Analyzed group so UI can match main page sections; defaults to checking_account + bills if omitted. */
  suggestedGroup?: BillSuggestedGroup;
}

/** Get YYYY-MM from a statement date string so month comparison is timezone-safe. */
function statementYearMonth(dateStr: string): { y: number; m: number } | null {
  const s = (dateStr ?? "").trim();
  if (!s) return null;
  // ISO or "YYYY-MM-DD ..." (e.g. 2025-03-12 or 2025-03-12T00:00:00.000Z)
  if (s.length >= 7 && s[4] === "-" && /\d{4}-\d{2}/.test(s.slice(0, 7))) {
    const y = parseInt(s.slice(0, 4), 10);
    const m = parseInt(s.slice(5, 7), 10) - 1;
    if (!Number.isNaN(y) && !Number.isNaN(m) && m >= 0 && m <= 11) return { y, m };
  }
  // Fallback: parse as date (handles MM/DD/YYYY, etc.) and use local calendar month
  const d = new Date(s);
  if (Number.isNaN(d.getTime())) return null;
  return { y: d.getFullYear(), m: d.getMonth() };
}

/**
 * Sum of paycheck-like deposits for the same calendar month as refDate.
 * Used to show "Paid this month" in the paychecks section.
 * Uses date-string month when possible so UTC-midnight statement dates count in the correct month.
 */
export function getPaycheckDepositsThisMonth(
  statements: StatementRecord[],
  refDate: Date
): number {
  const refY = refDate.getFullYear();
  const refM = refDate.getMonth();
  let sum = 0;
  for (const s of statements) {
    if (s.amount <= 0) continue;
    if (!isPaycheckLike(s.description)) continue;
    const stmt = statementYearMonth(s.date);
    if (!stmt || stmt.y !== refY || stmt.m !== refM) continue;
    sum += s.amount;
  }
  return sum;
}

/**
 * Group deposits by normalized description and infer paychecks.
 */
export function suggestPaychecksFromStatements(statements: StatementRecord[]): SuggestedPaycheck[] {
  const deposits = statements.filter((s) => s.amount > 0);
  const byKey = new Map<string, StatementRecord[]>();

  for (const row of deposits) {
    if (!isPaycheckLike(row.description)) continue;
    const name = inferPaycheckName(row.description);
    const key = name.toLowerCase().replace(/\s+/g, "_");
    if (!byKey.has(key)) byKey.set(key, []);
    byKey.get(key)!.push(row);
  }

  const suggested: SuggestedPaycheck[] = [];
  for (const [, rows] of byKey) {
    if (rows.length < 1) continue;
    const amounts = rows.map((r) => r.amount);
    const amount = Math.round((amounts.reduce((a, b) => a + b, 0) / amounts.length) * 100) / 100;
    const dates = rows.map((r) => r.date).filter(Boolean);
    const frequency = inferFrequency(dates);
    const lastDate = latestDateString(dates);
    const name = inferPaycheckName(rows[0]!.description);
    suggested.push({
      name,
      frequency,
      anchorDate: lastDate,
      amount,
      count: rows.length,
      lastDate,
    });
  }

  return suggested.sort((a, b) => b.count - a.count);
}

/** Normalize for fuzzy match: lowercase, collapse spaces. */
function normalizeForMatch(s: string): string {
  return (s ?? "").toLowerCase().replace(/\s+/g, " ").trim();
}

/**
 * Given statements and a paycheck display name (e.g. from PaycheckConfig.name), return the latest
 * deposit date that matches this paycheck, or null if none. Uses same grouping as suggestPaychecksFromStatements;
 * matches when the inferred paycheck name is the same or one contains the other (normalized).
 */
export function getLatestPaycheckDateForName(
  statements: StatementRecord[],
  paycheckName: string
): string | null {
  const deposits = statements.filter((s) => s.amount > 0 && isPaycheckLike(s.description));
  const searchNorm = normalizeForMatch(paycheckName);
  if (!searchNorm) return null;
  const matchingDates: string[] = [];
  for (const row of deposits) {
    const inferred = inferPaycheckName(row.description);
    const inferredNorm = normalizeForMatch(inferred);
    if (!inferredNorm) continue;
    if (inferredNorm === searchNorm || inferredNorm.includes(searchNorm) || searchNorm.includes(inferredNorm)) {
      if (row.date) matchingDates.push(row.date);
    }
  }
  if (matchingDates.length === 0) return null;
  return latestDateString(matchingDates);
}

/**
 * Group recurring transfers by whatFor and infer auto_transfers.
 */
export function suggestAutoTransfersFromStatements(statements: StatementRecord[]): SuggestedAutoTransfer[] {
  const byWhatFor = new Map<string, StatementRecord[]>();

  for (const row of statements) {
    const desc = row.description;
    let whatFor: string | null = null;
    for (const { re, whatFor: w } of [...AUTO_TRANSFER_FROM, ...AUTO_TRANSFER_TO]) {
      if (re.test(desc)) {
        whatFor = w;
        break;
      }
    }
    if (!whatFor) continue;
    const key = whatFor;
    if (!byWhatFor.has(key)) byWhatFor.set(key, []);
    byWhatFor.get(key)!.push(row);
  }

  const suggested: SuggestedAutoTransfer[] = [];
  for (const [whatFor, rows] of byWhatFor) {
    if (rows.length < 1) continue;
    const amounts = rows.map((r) => Math.abs(r.amount));
    const amount = Math.round((amounts.reduce((a, b) => a + b, 0) / amounts.length) * 100) / 100;
    const dates = rows.map((r) => r.date).filter(Boolean);
    const lastDate = latestDateString(dates);
    const gapDays = dates.length >= 2
      ? (new Date(dates[dates.length - 1]!).getTime() - new Date(dates[0]!).getTime()) / (24 * 60 * 60 * 1000) / (dates.length - 1)
      : 14;
    const frequency = gapDays >= 25 ? "Monthly" : "2 Weeks";
    suggested.push({
      whatFor,
      frequency,
      account: "Way2Save / Checking",
      date: lastDate,
      amount,
      count: rows.length,
    });
  }

  return suggested.sort((a, b) => b.count - a.count);
}

/** Normalize withdrawal description to a bill name for grouping. */
export function billNameFromDescription(description: string): string {
  const s = description.trim();
  if (/\bFreedom\s*Mtg|Freedom\s*Mtg/i.test(s)) return "Freedom Mortgage";
  if (/\bState\s*Farm/i.test(s)) return "State Farm";
  if (/\bDominion\s*Energy/i.test(s)) return "Dominion Energy";
  if (/\bProg\s*Preferred|Progressive/i.test(s)) return "Progressive Insurance";
  if (/\bThe\s*Ridge\s*at\s*Spa/i.test(s)) return "The Ridge at Spa";
  if (/\bOG\s*&\s*E|OG&E/i.test(s)) return "OG&E (Electricity)";
  // Walmart Plus (subscription) vs Walmart store (groceries & gas)
  if (/\bwalmart\s*plus|way2save.*walmart\s*plus/i.test(s)) return "Walmart Plus";
  // Walmart store: explicit name or bank format "Store# City ST" (e.g. "#4390 Enid OK") → Groceries & Gas
  if (/\bWalmart|Wal-Mart|Wal Mart/i.test(s)) return "Groceries & Gas";
  if (/^#?\s*\d{4,5}\s+[A-Za-z]+\s+[A-Z]{2}$/.test(s)) return "Groceries & Gas";
  if (/\bWM\s*#|WAL\s*MART\s*#/i.test(s)) return "Groceries & Gas";
  if (/\bSpotify/i.test(s)) return "Spotify";
  if (/\bHBO\s*Max|Hbomax/i.test(s)) return "HBO Max";
  if (/\bNetflix/i.test(s)) return "Netflix";
  if (/\bAmazon/i.test(s)) return "Amazon";
  if (/\bMonthly\s*Service\s*Fee/i.test(s)) return "Monthly Service Fee";
  const tokens = s.split(/\s+/).filter((t) => t.length > 1 && !/^\d+$/.test(t));
  if (tokens.length) return tokens.slice(0, 3).join(" ");
  return s.slice(0, 40) || "Bill";
}

function inferBillFrequency(dates: string[]): "2weeks" | "monthly" | "yearly" {
  if (dates.length < 2) return "monthly";
  const parsed = dates.map((d) => new Date(d).getTime()).sort((a, b) => a - b);
  const gaps: number[] = [];
  for (let i = 1; i < parsed.length; i++) gaps.push((parsed[i] - parsed[i - 1]) / (24 * 60 * 60 * 1000));
  const avgGap = gaps.reduce((a, b) => a + b, 0) / gaps.length;
  if (avgGap >= 300) return "yearly";
  if (avgGap >= 25 && avgGap <= 35) return "monthly";
  return "2weeks";
}

/** Keywords that indicate Spanish Fork (rental) bills. */
const SPANISH_FORK_BILL_KEYWORDS = [
  /spanish\s*fork/i,
  /ridge\s*at\s*spa|the\s*ridge/i,
  /state\s*farm\s*home|rental|utah\s*rent/i,
];

/** Keywords that indicate Oklahoma / Bills Account (vs Checking). */
const OKLAHOMA_BILL_KEYWORDS = [
  /og\s*&\s*e|oge\b/i,
  /dominion\s*energy/i,
  /oklahoma\s*(gas|electric|utility)?/i,
];

/** Keywords that indicate a subscription (vs a one-off bill). */
const SUBSCRIPTION_KEYWORDS = [
  /netflix|spotify|hbo\s*max|hbomax|disney\s*plus|hulu|apple\s*(tv|music)?|youtube\s*premium|amazon\s*prime|walmart\s*plus/i,
  /subscription|monthly\s*service|recurring\s*entertainment/i,
];

/**
 * Analyze bill name and return the main-page section + listType (grouping analysis).
 * Matches sections: Bills (Bills Account), Subscriptions (Bills Account), Bills (Checking Account), Subscriptions (Checking Account), Spanish Fork (Rental).
 */
export function suggestBillGroup(name: string): BillSuggestedGroup {
  const isSpanishFork = SPANISH_FORK_BILL_KEYWORDS.some((re) => re.test(name));
  const isOklahoma = OKLAHOMA_BILL_KEYWORDS.some((re) => re.test(name));
  const isSubscription = SUBSCRIPTION_KEYWORDS.some((re) => re.test(name));

  if (isSpanishFork) return { section: "spanish_fork", listType: "bills" };
  if (isOklahoma) return { section: "bills_account", listType: isSubscription ? "subscriptions" : "bills" };
  return { section: "checking_account", listType: isSubscription ? "subscriptions" : "bills" };
}

/**
 * Group recurring withdrawals by normalized description and infer average bill cost.
 * Each suggested bill gets suggestedGroup so the UI can match main page sections.
 */
export function suggestBillsFromStatements(statements: StatementRecord[]): SuggestedBill[] {
  const withdrawals = statements.filter((s) => s.amount < 0);
  const byKey = new Map<string, StatementRecord[]>();

  for (const row of withdrawals) {
    const name = billNameFromDescription(row.description);
    const key = name.toLowerCase().replace(/\s+/g, "_");
    if (!byKey.has(key)) byKey.set(key, []);
    byKey.get(key)!.push(row);
  }

  const suggested: SuggestedBill[] = [];
  for (const [, rows] of byKey) {
    if (rows.length < 1) continue;
    const amounts = rows.map((r) => Math.abs(r.amount));
    const amount = Math.round((amounts.reduce((a, b) => a + b, 0) / amounts.length) * 100) / 100;
    const dates = rows.map((r) => r.date).filter(Boolean);
    const frequency = inferBillFrequency(dates);
    const lastDate = latestDateString(dates);
    const name = billNameFromDescription(rows[0]!.description);
    const suggestedGroup = suggestBillGroup(name);
    suggested.push({ name, frequency, amount, count: rows.length, lastDate, suggestedGroup });
  }

  return suggested.sort((a, b) => b.count - a.count);
}

/**
 * Convert suggested paycheck to PocketBase paychecks record shape (for POST).
 */
export function suggestedPaycheckToRecord(s: SuggestedPaycheck): Record<string, unknown> {
  return {
    name: s.name,
    frequency: s.frequency,
    anchorDate: s.anchorDate,
    dayOfMonth: null,
    amount: s.amount,
  };
}

/**
 * Convert suggested auto_transfer to PocketBase auto_transfers record shape (for POST).
 */
export function suggestedAutoTransferToRecord(s: SuggestedAutoTransfer): Record<string, unknown> {
  return {
    whatFor: s.whatFor,
    frequency: s.frequency,
    account: s.account,
    date: s.date,
    amount: s.amount,
  };
}

/**
 * Convert suggested bill to PocketBase bills record shape (for POST).
 */
export function suggestedBillToRecord(s: SuggestedBill, account: string = "checking_account", listType: string = "bills"): Record<string, unknown> {
  const nextDue = s.lastDate || new Date().toISOString().slice(0, 10);
  const frequency = s.frequency === "2weeks" ? "2weeks" : s.frequency === "yearly" ? "yearly" : "monthly";
  return {
    name: s.name,
    frequency,
    nextDue,
    inThisPaycheck: false,
    amount: s.amount,
    account,
    listType,
  };
}
