/**
 * Exact PocketBase field names for each collection.
 * Derived from the real PB schema exports — never guess or retry with variants.
 *
 * Quirks in the real DB:
 *  - statements.goalid          (all lowercase, not camelCase)
 *  - statements.trasnferFromAccount  (typo: missing 'a' in "transfer")
 *  - spanish_fork_bills.recurringPaidStatementID  (capital "ID", not "Id")
 *  - paychecks.anchordate       (all lowercase, not camelCase)
 *  - statement_tag_rules.goalId (camelCase — different from statements!)
 */
export const PB = {
  statements: {
    goalId: "goalid",
    transferFromAccount: "trasnferFromAccount",
    transferToAccount: "transferToAccount",
    pairedStatementId: "pairedStatementId",
    sourceFile: "sourceFile",
    targetType: "targetType",
    targetSection: "targetSection",
    targetName: "targetName",
  },
  bills: {
    name: "name",
    frequency: "frequency",
    nextDue: "nextDue",
    amount: "amount",
    account: "account",
    listType: "listType",
    inThisPaycheck: "inThisPaycheck",
    autoTransferNote: "autoTransferNote",
    paidCycle: "recurringPaidCycle",
    paidGoalId: "recurringPaidGoalId",
    paidStatementId: "recurringPaidStatementId",
  },
  spanishForkBills: {
    name: "name",
    frequency: "frequency",
    nextDue: "nextDue",
    amount: "amount",
    inThisPaycheck: "inThisPaycheck",
    tenantPaid: "tenantPaid",
    paidCycle: "recurringPaidCycle",
    paidGoalId: "recurringPaidGoalId",
    paidStatementId: "recurringPaidStatementID",
  },
  goals: {
    name: "name",
    targetAmount: "targetAmount",
    currentAmount: "currentAmount",
    targetDate: "targetDate",
    category: "category",
    monthlyContribution: "monthlyContribution",
  },
  paychecks: {
    name: "name",
    frequency: "frequency",
    anchorDate: "anchordate",
    dayOfMonth: "dayOfMonth",
    amount: "amount",
    paidThisMonthYearMonth: "paidThisMonthYearMonth",
    amountPaidThisMonth: "amountPaidThisMonth",
  },
  autoTransfers: {
    whatFor: "whatFor",
    frequency: "frequency",
    account: "account",
    date: "date",
    amount: "amount",
    transferredThisCycle: "transferredThisCycle",
  },
  summary: {
    checkingBalance: "checkingBalance",
    billsBalance: "billsBalance",
    spanishForkBalance: "spanishForkBalance",
    spanishForkTenantRentMonthly: "spanishForkTenantRentMonthly",
  },
  statementTagRules: {
    pattern: "pattern",
    normalizedDescription: "normalizedDescription",
    targetType: "targetType",
    targetSection: "targetSection",
    targetName: "targetName",
    goalId: "goalId",
  },
  sections: {
    sortOrder: "sortOrder",
    type: "type",
    title: "title",
    subtitle: "subtitle",
    account: "account",
    listType: "listType",
  },
} as const;

/** PocketBase record IDs are 15 lowercase alphanumeric characters. */
export function isPbRecordId(id: string | null | undefined): boolean {
  if (!id) return false;
  return /^[a-z0-9]{15}$/.test(id);
}
