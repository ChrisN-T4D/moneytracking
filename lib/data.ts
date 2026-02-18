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

export const billsAccountBills: BillOrSub[] = [
  { id: "1", name: "Tithing (Bills Acct)", frequency: "monthly", nextDue: "Feb 28, 2026", inThisPaycheck: true, amount: 632.42, autoTransferNote: "Covered by monthly income transfer" },
  { id: "2", name: "Mortgage (Bills Acct)", frequency: "monthly", nextDue: "Feb 28, 2026", inThisPaycheck: true, amount: 1886.96, autoTransferNote: "Covered by monthly income transfer" },
  { id: "3", name: "Oklahoma Natural Gas", frequency: "monthly", nextDue: "Feb 28, 2026", inThisPaycheck: true, amount: 140, autoTransferNote: "Covered by monthly income transfer" },
  { id: "4", name: "State Farm Auto Insurance", frequency: "monthly", nextDue: "Mar 12, 2026", inThisPaycheck: true, amount: 241, autoTransferNote: "Covered by monthly income transfer" },
  { id: "5", name: "BluePeak (Internet)", frequency: "monthly", nextDue: "Mar 26, 2026", inThisPaycheck: false, amount: 65, autoTransferNote: "Covered by monthly income transfer" },
  { id: "6", name: "Fast Offerings (Bills Acct)", frequency: "monthly", nextDue: "Mar 3, 2026", inThisPaycheck: true, amount: 50, autoTransferNote: "Covered by monthly income transfer" },
  { id: "7", name: "OG & E (Electricity)", frequency: "monthly", nextDue: "Mar 11, 2026", inThisPaycheck: true, amount: 200, autoTransferNote: "Covered by monthly income transfer" },
  { id: "8", name: "Oklahoma City of Enid", frequency: "monthly", nextDue: "Feb 17, 2026", inThisPaycheck: false, amount: 100, autoTransferNote: "Covered by monthly income transfer" },
  { id: "9", name: "Life Insurance", frequency: "monthly", nextDue: "Mar 24, 2026", inThisPaycheck: false, amount: 226.14, autoTransferNote: "Covered by monthly income transfer" },
];

export const billsAccountSubs: BillOrSub[] = [
  { id: "s1", name: "Spotify (Bills Acct)", frequency: "monthly", nextDue: "Mar 2, 2026", inThisPaycheck: true, amount: 10.71 },
  { id: "s2", name: "Walmart + (Bills Acct)", frequency: "yearly", nextDue: "Jan 21, 2028", inThisPaycheck: false, amount: 98 },
  { id: "s3", name: "Disney + Premium (Bills Acct)", frequency: "yearly", nextDue: "Nov 11, 2027", inThisPaycheck: false, amount: 189 },
  { id: "s4", name: "Phone Bill - Mint Mobile (Bills Acct)", frequency: "yearly", nextDue: "Dec 25, 2027", inThisPaycheck: false, amount: 600 },
];

export const checkingAccountBills: BillOrSub[] = [
  { id: "c1", name: "Goldman Sachs (Emergency Savings)", frequency: "2weeks", nextDue: "Feb 13, 2026", inThisPaycheck: true, amount: 100, autoTransferNote: "See Autotransfer Table" },
  { id: "c2", name: "Rachel Demille", frequency: "2weeks", nextDue: "Feb 13, 2026", inThisPaycheck: true, amount: 30, autoTransferNote: "See Autotransfer Table" },
  { id: "c3", name: "Goldman Sachs (Future)", frequency: "2weeks", nextDue: "Feb 13, 2026", inThisPaycheck: true, amount: 0, autoTransferNote: "See Autotransfer Table" },
  { id: "c4", name: "Magic Spoon", frequency: "2weeks", nextDue: "Feb 13, 2026", inThisPaycheck: true, amount: 0, autoTransferNote: "See Autotransfer Table" },
  { id: "c5", name: "UofUtah Health Bill", frequency: "monthly", nextDue: "Mar 6, 2026", inThisPaycheck: true, amount: 100, autoTransferNote: "See Autotransfer Table" },
  { id: "c6", name: "Dog Grooming", frequency: "monthly", nextDue: "Mar 22, 2026", inThisPaycheck: false, amount: 200, autoTransferNote: "See Autotransfer Table" },
  { id: "c7", name: "401k", frequency: "monthly", nextDue: "Mar 25, 2026", inThisPaycheck: false, amount: 0, autoTransferNote: "See Autotransfer Table" },
  { id: "c8", name: "Harmonee Lunch", frequency: "monthly", nextDue: "Mar 1, 2026", inThisPaycheck: true, amount: 75, autoTransferNote: "See Autotransfer Table" },
  { id: "c9", name: "Piano Tuition", frequency: "monthly", nextDue: "Mar 1, 2026", inThisPaycheck: true, amount: 80, autoTransferNote: "See Autotransfer Table" },
];

export const checkingAccountSubs: BillOrSub[] = [
  { id: "cs1", name: "Netflix (to mom)", frequency: "monthly", nextDue: "Feb 28, 2026", inThisPaycheck: true, amount: 9 },
  { id: "cs2", name: "Audible (Checking)", frequency: "monthly", nextDue: "Mar 3, 2026", inThisPaycheck: true, amount: 0 },
  { id: "cs3", name: "Car Registration (Mazda)", frequency: "yearly", nextDue: "Aug 4, 2027", inThisPaycheck: false, amount: 150 },
  { id: "cs4", name: "Car Registration (Prius)", frequency: "yearly", nextDue: "Oct 4, 2027", inThisPaycheck: false, amount: 150 },
  { id: "cs5", name: "Clip Studio Paint Pro (Checking)", frequency: "yearly", nextDue: "Sep 7, 2027", inThisPaycheck: false, amount: 24.99 },
  { id: "cs6", name: "Amazon Prime (Checking)", frequency: "yearly", nextDue: "Jan 14, 2028", inThisPaycheck: false, amount: 139 },
  { id: "cs7", name: "Costco", frequency: "yearly", nextDue: "Jan 14, 2028", inThisPaycheck: false, amount: 120 },
];

export const autoTransfers: AutoTransfer[] = [
  { id: "a1", whatFor: "Oklahoma Bill Covering", frequency: "Monthly", account: "Oklahoma Bills", date: "2/2/2026", amount: 3400 },
  { id: "a2", whatFor: "Oklahoma Bill Remaining", frequency: "2 Weeks", account: "Oklahoma Bills", date: "1/30/2026", amount: 80 },
  { id: "a3", whatFor: "Spanish Fork Bill Covering", frequency: "2 Weeks", account: "Spanish Fork Bills", date: "1/30/2026", amount: 300 },
  { id: "a4", whatFor: "Subscription Covering", frequency: "2 Weeks", account: "Spanish Fork Bills", date: "1/30/2026", amount: 35 },
  { id: "a5", whatFor: "Fun Money (A)", frequency: "2 Weeks", account: "Account A", date: "1/30/2026", amount: 100 },
  { id: "a6", whatFor: "Fun Money (B)", frequency: "2 Weeks", account: "Account B", date: "1/30/2026", amount: 100 },
];

export const spanishForkBills: SpanishForkBill[] = [
  { id: "sf1", name: "Mortgage", frequency: "Monthly", nextDue: "Mar 6, 2026", inThisPaycheck: true, amount: 2024, tenantPaid: 1625 },
  { id: "sf2", name: "Spanish Fork City Utilities", frequency: "Monthly", nextDue: "Mar 25, 2026", inThisPaycheck: false, amount: 150, tenantPaid: 150 },
  { id: "sf3", name: "State Farm Home Insurance (Escrow)", frequency: "Monthly", nextDue: "Mar 25, 2026", inThisPaycheck: false, amount: 0, tenantPaid: 0 },
  { id: "sf4", name: "HOA Charge", frequency: "Monthly", nextDue: "Mar 11, 2026", inThisPaycheck: true, amount: 220, tenantPaid: 220 },
  { id: "sf5", name: "Internet + Cable", frequency: "Monthly", nextDue: "Mar 26, 2026", inThisPaycheck: false, amount: 10, tenantPaid: null },
  { id: "sf6", name: "Advantage Management", frequency: "Monthly", nextDue: "Mar 15, 2026", inThisPaycheck: false, amount: 146.25, tenantPaid: null },
  { id: "sf7", name: "Embridge Gas", frequency: "Monthly", nextDue: "Mar 15, 2026", inThisPaycheck: false, amount: 35, tenantPaid: 35 },
];

export const goals: MoneyGoal[] = [
  {
    id: "g1",
    name: "Emergency fund to $5,000",
    targetAmount: 5000,
    currentAmount: 2500,
    targetDate: "2026-12-31",
    category: "Savings",
  },
  {
    id: "g2",
    name: "Pay off credit card",
    targetAmount: 3000,
    currentAmount: 1200,
    targetDate: "2026-08-01",
    category: "Debt",
  },
];
