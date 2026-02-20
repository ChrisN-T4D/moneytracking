import type { Summary, BillOrSub, AutoTransfer, SpanishForkBill, MoneyGoal } from "./types";

export const initialSummary: Summary = {
  monthlyTotal: 6324.16,
  totalNeeded: 4938.31,
  billsAccountNeeded: 3541.52,
  checkingAccountNeeded: 715,
  spanishForkNeeded: 555.25,
  billsSubscriptions: 68.88,
  checkingSubscriptions: 57.67,
  leftOver: 921.49,
  leftOverPerPaycheck: 460.75,
  planToFamily: "100 per paycheck",
};

// Bills Schedule from PDF: Bills (Bills Account) — charge date and frequency
export const billsAccountBills: BillOrSub[] = [
  { id: "1", name: "Tithing (Bills Acct)", frequency: "monthly", nextDue: "2026-03-13", inThisPaycheck: true, amount: 632.42, autoTransferNote: "Covered by C monthly income transfer" },
  { id: "2", name: "Mortgage (Bills Acct)", frequency: "monthly", nextDue: "2026-03-13", inThisPaycheck: true, amount: 1886.96, autoTransferNote: "Covered by C monthly income transfer" },
  { id: "3", name: "Oklahoma Natural Gas", frequency: "monthly", nextDue: "2026-04-03", inThisPaycheck: false, amount: 140, autoTransferNote: "Covered by C monthly income transfer" },
  { id: "4", name: "State Farm Auto Insurance", frequency: "monthly", nextDue: "2026-04-12", inThisPaycheck: false, amount: 241, autoTransferNote: "Covered by C monthly income transfer" },
  { id: "5", name: "BluePeak (Internet)", frequency: "monthly", nextDue: "2026-03-26", inThisPaycheck: true, amount: 65, autoTransferNote: "Covered by C monthly income transfer" },
  { id: "6", name: "Fast Offerings (Bills Acct)", frequency: "monthly", nextDue: "2026-04-03", inThisPaycheck: false, amount: 50, autoTransferNote: "Covered by C monthly income transfer" },
  { id: "7", name: "OG & E (Electricity)", frequency: "monthly", nextDue: "2026-04-11", inThisPaycheck: false, amount: 200, autoTransferNote: "Covered by C monthly income transfer" },
  { id: "8", name: "Oklahoma City of Enid", frequency: "monthly", nextDue: "2026-03-17", inThisPaycheck: true, amount: 100, autoTransferNote: "Covered by C monthly income transfer" },
  { id: "9", name: "Life Insurance", frequency: "monthly", nextDue: "2026-03-24", inThisPaycheck: true, amount: 226.14, autoTransferNote: "Covered by C monthly income transfer" },
];

// Subscriptions (Bills Account) — charge date and frequency from PDF
export const billsAccountSubs: BillOrSub[] = [
  { id: "s1", name: "Spotify (Bills Acct)", frequency: "monthly", nextDue: "2026-04-02", inThisPaycheck: false, amount: 10.71 },
  { id: "s2", name: "Walmart + (Bills Acct)", frequency: "yearly", nextDue: "2028-01-21", inThisPaycheck: false, amount: 98 },
  { id: "s3", name: "Disney + Premium (Bills Acct)", frequency: "yearly", nextDue: "2027-11-11", inThisPaycheck: false, amount: 189 },
  { id: "s4", name: "Phone Bill - Mint Mobile (Bills Acct)", frequency: "yearly", nextDue: "2027-12-25", inThisPaycheck: false, amount: 600 },
];

// Bills (Checking Account) — charge date and frequency from PDF
export const checkingAccountBills: BillOrSub[] = [
  { id: "c1", name: "Goldman Sachs (Emergency Savings)", frequency: "2weeks", nextDue: "2026-02-27", inThisPaycheck: true, amount: 100, autoTransferNote: "See Autotransfer Table" },
  { id: "c2", name: "Rachel Demille", frequency: "2weeks", nextDue: "2026-02-27", inThisPaycheck: true, amount: 30, autoTransferNote: "See Autotransfer Table" },
  { id: "c3", name: "Goldman Sachs (Future)", frequency: "2weeks", nextDue: "2026-02-27", inThisPaycheck: true, amount: 0, autoTransferNote: "See Autotransfer Table" },
  { id: "c4", name: "Magic Spoon", frequency: "2weeks", nextDue: "2026-02-27", inThisPaycheck: true, amount: 0, autoTransferNote: "See Autotransfer Table" },
  { id: "c5", name: "UofUtah Health Bill", frequency: "monthly", nextDue: "2026-04-06", inThisPaycheck: false, amount: 100, autoTransferNote: "See Autotransfer Table" },
  { id: "c6", name: "Dog Grooming", frequency: "monthly", nextDue: "2026-03-22", inThisPaycheck: true, amount: 200, autoTransferNote: "See Autotransfer Table" },
  { id: "c7", name: "Chris 401k", frequency: "monthly", nextDue: "2026-03-25", inThisPaycheck: true, amount: 0, autoTransferNote: "See Autotransfer Table" },
  { id: "c8", name: "Harmonee Lunch", frequency: "monthly", nextDue: "2026-04-01", inThisPaycheck: false, amount: 75, autoTransferNote: "See Autotransfer Table" },
  { id: "c9", name: "Piano Tuition", frequency: "monthly", nextDue: "2026-04-01", inThisPaycheck: false, amount: 80, autoTransferNote: "See Autotransfer Table" },
];

// Subscriptions (Checking Account) — charge date and frequency from PDF
export const checkingAccountSubs: BillOrSub[] = [
  { id: "cs1", name: "Netflix (to mom)", frequency: "monthly", nextDue: "2026-04-02", inThisPaycheck: false, amount: 9 },
  { id: "cs2", name: "Audible- $16.03 (No Paypal Option) (Checking)", frequency: "monthly", nextDue: "2026-04-03", inThisPaycheck: false, amount: 0 },
  { id: "cs3", name: "Car Registration (Mazda)", frequency: "yearly", nextDue: "2027-08-04", inThisPaycheck: false, amount: 150 },
  { id: "cs4", name: "Car Registration (Prius)", frequency: "yearly", nextDue: "2027-10-04", inThisPaycheck: false, amount: 150 },
  { id: "cs5", name: "Clip Studio Paint Pro (No Paypal Option)", frequency: "yearly", nextDue: "2027-09-07", inThisPaycheck: false, amount: 24.99 },
  { id: "cs6", name: "Amazon Prime (No Paypal Option) (Checking)", frequency: "yearly", nextDue: "2028-01-14", inThisPaycheck: false, amount: 139 },
  { id: "cs7", name: "Costco (No Paypal Acct)", frequency: "yearly", nextDue: "2028-01-14", inThisPaycheck: false, amount: 120 },
];

export const autoTransfers: AutoTransfer[] = [
  { id: "a1", whatFor: "Oklahoma Bill Covering", frequency: "Monthly", account: "Oklahoma Bills", date: "3/2/2026", amount: 3400 },
  { id: "a2", whatFor: "Oklahoma Bill Remaining", frequency: "2 Weeks", account: "Oklahoma Bills", date: "2/13/2026", amount: 80 },
  { id: "a3", whatFor: "Spanish Fork Bill Covering", frequency: "2 Weeks", account: "Spanish Fork Bills", date: "2/13/2026", amount: 300 },
  { id: "a4", whatFor: "Subscription Covering", frequency: "2 Weeks", account: "Spanish Fork Bills", date: "2/13/2026", amount: 35 },
  { id: "a5", whatFor: "Fun Money (Chris)", frequency: "2 Weeks", account: "Chris Account", date: "2/13/2026", amount: 100 },
  { id: "a6", whatFor: "Fun Money (Melodee)", frequency: "2 Weeks", account: "Melodee Account", date: "2/13/2026", amount: 100 },
];

// Spanish Fork bills from PDF — next due and frequency (tenant paid amounts in UI)
export const spanishForkBills: SpanishForkBill[] = [
  { id: "sf1", name: "Mortgage", frequency: "monthly", nextDue: "2026-04-06", inThisPaycheck: false, amount: 2024, tenantPaid: true },
  { id: "sf2", name: "Spanish Fork City Utilities (Varies) Due 25th", frequency: "monthly", nextDue: "2026-03-25", inThisPaycheck: true, amount: 150, tenantPaid: true },
  { id: "sf3", name: "State Farm Home Insurance (Bills Acct) Paid Via Escrow", frequency: "monthly", nextDue: "2026-03-25", inThisPaycheck: true, amount: 0, tenantPaid: false },
  { id: "sf4", name: "HOA Charge", frequency: "monthly", nextDue: "2026-04-11", inThisPaycheck: false, amount: 220, tenantPaid: true },
  { id: "sf5", name: "Internet + Cable", frequency: "monthly", nextDue: "2026-03-26", inThisPaycheck: true, amount: 10, tenantPaid: false },
  { id: "sf6", name: "Advantage Management", frequency: "monthly", nextDue: "2026-03-15", inThisPaycheck: true, amount: 146.25, tenantPaid: false },
  { id: "sf7", name: "Embridge Gas (Varies)", frequency: "monthly", nextDue: "2026-03-15", inThisPaycheck: true, amount: 35, tenantPaid: true },
];

export const goals: MoneyGoal[] = [
  {
    id: "g1",
    name: "Emergency fund to $5,000",
    targetAmount: 5000,
    currentAmount: 2500,
    targetDate: "2026-12-31",
    category: "Savings",
    monthlyContribution: 100,
  },
  {
    id: "g2",
    name: "Pay off credit card",
    targetAmount: 3000,
    currentAmount: 1200,
    targetDate: "2026-08-01",
    category: "Debt",
    monthlyContribution: 200,
  },
];
