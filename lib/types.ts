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
