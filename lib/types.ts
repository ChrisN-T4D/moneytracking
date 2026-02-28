export type Frequency = "2weeks" | "monthly" | "yearly";

export interface BillOrSub {
  id: string;
  name: string;
  frequency: Frequency;
  nextDue: string;
  inThisPaycheck: boolean;
  amount: number;
  autoTransferNote?: string;
  subsection?: string | null;
}

export interface AutoTransfer {
  id: string;
  whatFor: string;
  frequency: string;
  account: string;
  date: string;
  amount: number;
  /** True when the transfer has gone through this paycheck/cycle (PB: transferredThisCycle). */
  transferredThisCycle?: boolean;
}

export interface SpanishForkBill {
  id: string;
  name: string;
  frequency: string;
  nextDue: string;
  inThisPaycheck: boolean;
  amount: number;
  tenantPaid: boolean;
}

export interface Summary {
  monthlyTotal: number;
  totalNeeded: number;
  billsAccountNeeded: number;
  checkingAccountNeeded: number;
  spanishForkNeeded: number;
  billsSubscriptions: number;
  checkingSubscriptions: number;
  leftOver: number;
  leftOverPerPaycheck: number;
  planToFamily: string;
  /** Manually entered current balances, updated every ~2 weeks */
  checkingBalance?: number | null;
  billsBalance?: number | null;
  spanishForkBalance?: number | null;
  /** Monthly rent from Spanish Fork tenants; offsets Spanish Fork bills in "what we need" */
  spanishForkTenantRentMonthly?: number | null;
}

/** Paycheck config from PocketBase or defaults (for next-pay date calculation). */
export type PaycheckFrequency = "biweekly" | "monthly" | "monthlyLastWorkingDay";

export interface PaycheckConfig {
  id: string;
  name: string;
  frequency: PaycheckFrequency;
  /** For biweekly: any Thursday in the series (ISO date string). */
  anchorDate: string | null;
  /** For monthly (fixed day): day of month 1–31. Not used for monthlyLastWorkingDay. */
  dayOfMonth: number | null;
  amount: number | null;
  /** When set, this paycheck counts toward "Paid this month" for the given year-month (e.g. "2026-02"). */
  paidThisMonthYearMonth?: string | null;
  /** Amount that counts toward "Paid this month" when paidThisMonthYearMonth matches current month. */
  amountPaidThisMonth?: number | null;
  /** When a biweekly pay date falls exactly half in two months ("split"), which month to count it in. */
  fundingMonthPreference?: "same_month" | "next_month" | "split" | null;
  /** User id of who last edited (for audit). */
  lastEditedByUserId?: string | null;
  /** Display name or email of who last edited. */
  lastEditedBy?: string | null;
  /** When the record was last edited (ISO string). */
  lastEditedAt?: string | null;
}

/** Section definition from PocketBase – which sections to show and in what order. */
export type SectionType = "bills_list" | "spanish_fork" | "auto_transfers";
export type BillListAccount = "bills_account" | "checking_account";
export type BillListType = "bills" | "subscriptions";

export interface Section {
  id: string;
  sortOrder: number;
  type: SectionType;
  title: string;
  subtitle?: string | null;
  /** For type=bills_list: which account. */
  account?: BillListAccount | null;
  /** For type=bills_list: bills vs subscriptions. */
  listType?: BillListType | null;
}

/** One row from an uploaded statement CSV (stored in PocketBase `statements` collection). */
export interface StatementRecord {
  id: string;
  date: string;
  description: string;
  amount: number;
  balance?: number | null;
  category?: string | null;
  account?: string | null;
  sourceFile?: string | null;
  /** Optional goal id this statement contributes to (PocketBase `goals` collection). */
  goalId?: string | null;
}

/** Learned rule for tagging statement rows into sections/types. */
export type StatementTagTargetType =
  | "bill"
  | "subscription"
  | "spanish_fork"
  | "auto_transfer"
  | "variable_expense"
  | "ignore";

export type ConfidenceLevel = "HIGH" | "MEDIUM" | "LOW";

export interface StatementTagRule {
  id: string;
  /** Match key for description, e.g. first few words uppercased. */
  pattern: string;
  /** Optional normalized description / grouped name. */
  normalizedDescription: string | null;
  targetType: StatementTagTargetType;
  /** Which section on the main page (Bills/Checking/Spanish Fork), if applicable. */
  targetSection: BillListAccount | "spanish_fork" | null;
  /** Name to use on the main page (bill/auto-transfer name). */
  targetName: string | null;
  /** Optional goal ID this statement contributes to (PocketBase `goals` collection). */
  goalId?: string | null;
  /** Number of times this rule has been successfully applied. */
  useCount?: number;
  /** Number of times this rule was overridden by user (indicates lower confidence). */
  overrideCount?: number;
}

export interface MoneyGoal {
  id: string;
  name: string;
  targetAmount: number;
  currentAmount: number;
  /** Optional ISO date string like 2026-12-31 */
  targetDate?: string | null;
  /** e.g. "Savings", "Debt", etc. */
  category?: string | null;
  /** How much to put toward this goal per month */
  monthlyContribution?: number | null;
}
