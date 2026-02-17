export type Frequency = "2weeks" | "monthly" | "yearly";

export interface BillOrSub {
  id: string;
  name: string;
  frequency: Frequency;
  nextDue: string;
  inThisPaycheck: boolean;
  amount: number;
  autoTransferNote?: string;
}

export interface AutoTransfer {
  id: string;
  whatFor: string;
  frequency: string;
  account: string;
  date: string;
  amount: number;
}

export interface SpanishForkBill {
  id: string;
  name: string;
  frequency: string;
  nextDue: string;
  inThisPaycheck: boolean;
  amount: number;
  tenantPaid: number | null;
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
}
