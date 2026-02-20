import { SummaryCard } from "@/components/SummaryCard";
import { NextPaychecksCard } from "@/components/NextPaychecksCard";
import { BillsList } from "@/components/BillsList";
import { SpanishForkSection } from "@/components/SpanishForkSection";
import { AutoTransfersSection } from "@/components/AutoTransfersSection";
import { GoalsSection } from "@/components/GoalsSection";
import { GoalsProvider } from "@/components/GoalsContext";
import { HeaderPreferencesMenu } from "@/components/HeaderPreferencesMenu";
import { HeaderAuth } from "@/components/HeaderAuth";
import { AuthenticatedContent } from "@/components/AuthenticatedContent";
import { DraggableSectionCards } from "@/components/DraggableSectionCards";
import {
  initialSummary,
  billsAccountBills,
  billsAccountSubs,
  checkingAccountBills,
  checkingAccountSubs,
  autoTransfers,
  spanishForkBills,
  goals as staticGoals,
} from "@/lib/data";
import {
  getPaychecks,
  getSections,
  getBillsWithMeta,
  filterBillsWithMeta,
  groupBillsBySubsection,
  normalizeKeyForGrouping,
  getAutoTransfers,
  getSpanishForkBills,
  getSummary,
  getStatements,
  getStatementTagRules,
  getGoals,
} from "@/lib/pocketbase";
import type { BillListAccount, BillListType, Section, Summary, SpanishForkBill, AutoTransfer, MoneyGoal } from "@/lib/types";
import type { BillOrSubWithMeta } from "@/lib/pocketbase";
import { computeActualsForMonthWithBreakdown, computeSpentForBillKeysInDateRange, VARIABLE_EXPENSES_BILL_KEY, matchRule } from "@/lib/statementTagging";
import { getPaycheckDepositsThisMonth } from "@/lib/statementsAnalysis";
import {
  predictedNeedByAccountFromPb,
  predictedNeedByAccountFromLists,
  autoTransfersMonthlyByAccount,
  expectedPaychecksThisMonthDetail,
  computeMoneyStatus,
} from "@/lib/summaryCalculations";
import { getNextDueAndPaycheck, getTodayUTC } from "@/lib/paycheckDates";
import { getNextBiweeklyPayDate } from "@/lib/paycheckConfig";

export const dynamic = "force-dynamic";

/** One section per (type, account, listType) to avoid doubled/tripled sections if PB was seeded multiple times. */
function dedupeSections(sections: Section[]): Section[] {
  const seen = new Set<string>();
  return sections
    .slice()
    .sort((a, b) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0))
    .filter((s) => {
      const key =
        s.type === "bills_list"
          ? `${s.type}|${s.account ?? ""}|${s.listType ?? ""}`
          : `${s.type}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
}

/** Default section order when PocketBase is configured but sections collection is empty. */
const DEFAULT_SECTIONS: Section[] = [
  { id: "default-0", sortOrder: 0, type: "bills_list", title: "Bills (Bills Account)", subtitle: "Oklahoma bills", account: "bills_account", listType: "bills" },
  { id: "default-1", sortOrder: 1, type: "bills_list", title: "Subscriptions (Bills Account)", subtitle: "", account: "bills_account", listType: "subscriptions" },
  { id: "default-2", sortOrder: 2, type: "bills_list", title: "Bills (Checking Account)", subtitle: "Checking bills", account: "checking_account", listType: "bills" },
  { id: "default-3", sortOrder: 3, type: "bills_list", title: "Subscriptions (Checking Account)", subtitle: "", account: "checking_account", listType: "subscriptions" },
  { id: "default-4", sortOrder: 4, type: "spanish_fork", title: "Spanish Fork (Rental)", subtitle: "Bills with tenant paid amounts", account: null, listType: null },
  { id: "default-5", sortOrder: 5, type: "auto_transfers", title: "Auto transfers", subtitle: "Money moved between accounts to cover what we need (e.g. to Bills account, Spanish Fork account). Fun money isn't tracked here.", account: null, listType: null },
];

/** Resolve next due and in-this-paycheck for static bill lists so dates advance by frequency. */
function resolveStaticBillDates<T extends { nextDue?: string; frequency?: string; inThisPaycheck?: boolean }>(
  list: T[],
  paycheckEndDate?: Date | null
): T[] {
  const ref = getTodayUTC();
  return list.map((b) => {
    const { nextDue, inThisPaycheck } = getNextDueAndPaycheck(
      b.nextDue ?? "",
      b.frequency ?? "monthly",
      ref,
      paycheckEndDate
    );
    return { ...b, nextDue, inThisPaycheck };
  });
}

export default async function Home() {
  const today = new Date();
  const hasPb = Boolean(process.env.NEXT_PUBLIC_POCKETBASE_URL);

  const paycheckConfigs = await getPaychecks();
  const ref = getTodayUTC();
  const biweeklyEnd = getNextBiweeklyPayDate(paycheckConfigs, ref) ?? undefined;

  const [
    sections,
    billsWithMeta,
    autoTransfersPb,
    spanishForkPb,
    summaryPb,
    statements,
    tagRules,
    goalsPb,
  ] =
    hasPb
      ? await Promise.all([
          getSections(),
          getBillsWithMeta(biweeklyEnd),
          getAutoTransfers(),
          getSpanishForkBills(biweeklyEnd),
          getSummary(),
          getStatements({ perPage: 1000, sort: "-date" }),
          getStatementTagRules(),
          getGoals(),
        ])
      : [
          [],
          [] as Awaited<ReturnType<typeof getBillsWithMeta>>,
          [],
          [],
          null,
          [],
          [],
          [],
        ];

  // When PocketBase is configured, use PB data for everything; use default section order if sections collection is empty
  const usePb = hasPb;
  const sectionsToRender = hasPb
    ? (sections.length > 0 ? dedupeSections(sections) : DEFAULT_SECTIONS)
    : [];
  const summary = hasPb && summaryPb ? summaryPb : initialSummary;

  // Resolve next-due and in-this-paycheck for static lists so dates advance by frequency (used when !usePb). Synced with biweekly pay date when available.
  const resolvedBillsAccountBills = resolveStaticBillDates(billsAccountBills, biweeklyEnd);
  const resolvedBillsAccountSubs = resolveStaticBillDates(billsAccountSubs, biweeklyEnd);
  const resolvedCheckingAccountBills = resolveStaticBillDates(checkingAccountBills, biweeklyEnd);
  const resolvedCheckingAccountSubs = resolveStaticBillDates(checkingAccountSubs, biweeklyEnd);
  const resolvedSpanishForkBills = resolveStaticBillDates(spanishForkBills, biweeklyEnd);
  // This month: tagged statements count toward each subsection's "paid this month" (with breakdown for drill-down).
  const { rows: thisMonthActuals, breakdown: paidBreakdownByBill } =
    hasPb && statements.length > 0 && tagRules.length > 0
      ? computeActualsForMonthWithBreakdown(
          statements,
          tagRules,
          today.getFullYear(),
          today.getMonth()
        )
      : { rows: [] as import("@/lib/statementTagging").ActualRow[], breakdown: new Map<string, import("@/lib/statementTagging").ActualBreakdownItem[]>() };
  const paidThisMonthBySection = new Map<string, number>();
  // Per-bill map: "section|listType|name_lowercase" → amount
  const paidThisMonthByBill = new Map<string, number>();
  for (const row of thisMonthActuals) {
    const sectionKey = `${row.section}|${row.listType ?? "bills"}`;
    paidThisMonthBySection.set(sectionKey, (paidThisMonthBySection.get(sectionKey) ?? 0) + row.actualAmount);
    const billKey = `${row.section}|${row.listType ?? "bills"}|${row.name.toLowerCase()}`;
    paidThisMonthByBill.set(billKey, (paidThisMonthByBill.get(billKey) ?? 0) + row.actualAmount);
  }
  const monthlySpendingBySection = paidThisMonthBySection;

  // Compute goal progress by matching statements against tag rules (which carry goalId).
  // This works even for statements that were tagged before goalId was saved to the statement record.
  const goalProgressById = new Map<string, number>();
  for (const s of statements) {
    // First check the statement's own goalId (set on newer tags)
    const directGoalId = s.goalId;
    if (directGoalId) {
      goalProgressById.set(directGoalId, (goalProgressById.get(directGoalId) ?? 0) + Math.abs(s.amount));
      continue;
    }
    // Fall back: match statement against tag rules and use the rule's goalId
    const matched = tagRules.length > 0 ? matchRule(tagRules, s) : null;
    if (matched?.rule.goalId) {
      const gid = matched.rule.goalId;
      goalProgressById.set(gid, (goalProgressById.get(gid) ?? 0) + Math.abs(s.amount));
    }
  }

  const baseGoals = hasPb && goalsPb.length > 0 ? goalsPb : staticGoals;
  const goals = baseGoals.map((g) => ({
    ...g,
    // Prefer statement-derived total; fall back to stored PB value when no statements are tagged yet.
    currentAmount: goalProgressById.has(g.id)
      ? (goalProgressById.get(g.id) ?? 0)
      : (g.currentAmount ?? 0),
  }));

  // Paycheck deposits this month (for "Paid this month" in paychecks section):
  // (1) from imported statements that look like paychecks, (2) from paychecks added via modal with paidThisMonthYearMonth set
  const currentYearMonth = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, "0")}`;
  // For last-working-day paychecks: the end-of-month payment covers the *next* month's bills.
  // So in the current month we look for a stored paidThisMonthYearMonth from the *previous* month.
  const prevDate = new Date(today.getFullYear(), today.getMonth() - 1, 1);
  const prevYearMonth = `${prevDate.getFullYear()}-${String(prevDate.getMonth() + 1).padStart(2, "0")}`;
  const fromStatements =
    hasPb && statements.length > 0 ? getPaycheckDepositsThisMonth(statements, today) : 0;
  const fromAddedPaychecks =
    hasPb && paycheckConfigs.length > 0
      ? paycheckConfigs
          .filter((p) => {
            if ((p.amountPaidThisMonth ?? 0) <= 0) return false;
            // Last-working-day: end-of-Feb paycheck covers March, so in March we look for "2026-02"
            if (p.frequency === "monthlyLastWorkingDay") {
              return p.paidThisMonthYearMonth === prevYearMonth;
            }
            return p.paidThisMonthYearMonth === currentYearMonth;
          })
          .reduce((sum, p) => sum + (p.amountPaidThisMonth ?? 0), 0)
      : 0;
  const paycheckPaidThisMonth = fromStatements + fromAddedPaychecks;

  // Current money status: predicted need by account + auto transfers + paychecks
  const predictedNeedRaw = hasPb
    ? predictedNeedByAccountFromPb(billsWithMeta, spanishForkPb)
    : predictedNeedByAccountFromLists(
        resolvedBillsAccountBills,
        resolvedBillsAccountSubs,
        resolvedCheckingAccountBills,
        resolvedCheckingAccountSubs,
        resolvedSpanishForkBills
      );
  // Net Spanish Fork need: our bills minus tenant rent (rent offsets what we need to cover)
  const tenantRentMonthly = summary.spanishForkTenantRentMonthly ?? 0;
  const predictedNeed = {
    ...predictedNeedRaw,
    spanishFork: Math.max(0, predictedNeedRaw.spanishFork - tenantRentMonthly),
  };
  const autoTransfersMonthly = autoTransfersMonthlyByAccount(hasPb ? autoTransfersPb : autoTransfers);
  // Use CURRENT month for money status and left over (so paid/variable data matches).
  const currentMonth = new Date(today.getFullYear(), today.getMonth(), 1);
  const nextMonth = new Date(today.getFullYear(), today.getMonth() + 1, 1);
  const { total: paychecksCurrentMonth, payDates } = expectedPaychecksThisMonthDetail(paycheckConfigs, currentMonth);
  const { total: paychecksNextMonth, payDates: payDatesNextMonth } = expectedPaychecksThisMonthDetail(paycheckConfigs, nextMonth);
  const forMonthName = currentMonth.toLocaleString("en-US", { month: "long" });
  const nextMonthName = nextMonth.toLocaleString("en-US", { month: "long" });
  const totalGoalContributions = goals.reduce((sum, g) => sum + (g.monthlyContribution ?? 0), 0);
  const accountBalances = {
    checking: summary.checkingBalance ?? null,
    bills: summary.billsBalance ?? null,
    spanishFork: summary.spanishForkBalance ?? null,
  };
  const paidThisMonthByAccount = {
    bills: (monthlySpendingBySection.get("bills_account|bills") ?? 0) + (monthlySpendingBySection.get("bills_account|subscriptions") ?? 0),
    checking: (monthlySpendingBySection.get("checking_account|bills") ?? 0) + (monthlySpendingBySection.get("checking_account|subscriptions") ?? 0),
    spanishFork: monthlySpendingBySection.get("spanish_fork|bills") ?? 0,
  };
  const variableExpensesThisMonth = paidThisMonthByBill.get(VARIABLE_EXPENSES_BILL_KEY) ?? 0;
  const moneyStatus = computeMoneyStatus(predictedNeed, autoTransfersMonthly, paychecksCurrentMonth, payDates, forMonthName, totalGoalContributions, accountBalances, paidThisMonthByAccount, variableExpensesThisMonth);

  // Groceries & Gas: $250 per paycheck; remaining = 250 - spent in current pay period (biweekly)
  const GROCERIES_AND_GAS_PER_PAYCHECK = 250;
  const todayDay = new Date(today.getFullYear(), today.getMonth(), today.getDate());
  const nextBiweekly = getNextBiweeklyPayDate(paycheckConfigs, today);
  const groceriesAndGasBudget = GROCERIES_AND_GAS_PER_PAYCHECK;
  let groceriesAndGasSpent = 0;
  if (nextBiweekly) {
    const periodEnd = new Date(nextBiweekly.getFullYear(), nextBiweekly.getMonth(), nextBiweekly.getDate());
    const periodStart = new Date(periodEnd);
    periodStart.setDate(periodStart.getDate() - 14);
    const billKeys = ["checking_account|bills|groceries", "checking_account|bills|gas", "checking_account|bills|groceries & gas"];
    if (todayDay < periodEnd) {
      groceriesAndGasSpent =
        hasPb && statements.length > 0 && tagRules.length > 0
          ? computeSpentForBillKeysInDateRange(statements, tagRules, periodStart, periodEnd, billKeys)
          : (paidThisMonthByBill.get("checking_account|bills|groceries") ?? 0) +
            (paidThisMonthByBill.get("checking_account|bills|gas") ?? 0) +
            (paidThisMonthByBill.get("checking_account|bills|groceries & gas") ?? 0);
    } else {
      periodStart.setTime(periodEnd.getTime());
      periodEnd.setDate(periodEnd.getDate() + 14);
      groceriesAndGasSpent =
        hasPb && statements.length > 0 && tagRules.length > 0
          ? computeSpentForBillKeysInDateRange(statements, tagRules, periodStart, periodEnd, billKeys)
          : 0;
    }
  } else {
    groceriesAndGasSpent =
      (paidThisMonthByBill.get("checking_account|bills|groceries") ?? 0) +
      (paidThisMonthByBill.get("checking_account|bills|gas") ?? 0) +
      (paidThisMonthByBill.get("checking_account|bills|groceries & gas") ?? 0);
  }
  const moneyStatusWithExtras = moneyStatus as import("@/lib/summaryCalculations").MoneyStatus & { incomeNextMonth?: number; nextMonthName?: string };
  moneyStatusWithExtras.subsections = {
    groceriesAndGas: { budget: groceriesAndGasBudget, spent: groceriesAndGasSpent },
  };
  moneyStatusWithExtras.variableExpensesBreakdown = paidBreakdownByBill.get(VARIABLE_EXPENSES_BILL_KEY) ?? [];
  moneyStatusWithExtras.incomeNextMonth = paychecksNextMonth;
  moneyStatusWithExtras.nextMonthName = nextMonthName;

  return (
    <AuthenticatedContent>
      <MainContent
          hasPb={hasPb}
          today={today}
          summary={summary}
          goals={goals}
          usePb={usePb}
          sectionsToRender={sectionsToRender}
          billsWithMeta={billsWithMeta}
          spanishForkPb={spanishForkPb}
          autoTransfersPb={autoTransfersPb}
          billsAccountBills={resolvedBillsAccountBills}
          billsAccountSubs={resolvedBillsAccountSubs}
          checkingAccountBills={resolvedCheckingAccountBills}
          checkingAccountSubs={resolvedCheckingAccountSubs}
          spanishForkBills={resolvedSpanishForkBills}
          autoTransfers={autoTransfers}
          monthlySpendingBySection={monthlySpendingBySection}
          paidThisMonthByBill={paidThisMonthByBill}
          paidBreakdownByBill={paidBreakdownByBill}
          paycheckPaidThisMonth={paycheckPaidThisMonth}
          paycheckConfigs={paycheckConfigs}
          moneyStatus={moneyStatusWithExtras}
          paycheckEndDate={biweeklyEnd ?? null}
          spanishForkGrossNeed={predictedNeedRaw.spanishFork}
          tenantRentMonthly={summary.spanishForkTenantRentMonthly ?? null}
        />
      </AuthenticatedContent>
  );
}

function MainContent({
  hasPb,
  today,
  summary: _summary,
  goals,
  usePb: _usePb,
  sectionsToRender,
  billsWithMeta,
  spanishForkPb,
  autoTransfersPb,
  billsAccountBills,
  billsAccountSubs,
  checkingAccountBills,
  checkingAccountSubs,
  spanishForkBills,
  autoTransfers,
  monthlySpendingBySection,
  paidThisMonthByBill,
  paidBreakdownByBill,
  paycheckPaidThisMonth,
  paycheckConfigs,
  moneyStatus,
  paycheckEndDate,
  spanishForkGrossNeed,
  tenantRentMonthly,
}: {
  hasPb: boolean;
  today: Date;
  summary: Summary | null;
  goals: MoneyGoal[];
  usePb: boolean;
  sectionsToRender: Section[];
  billsWithMeta: BillOrSubWithMeta[];
  spanishForkPb: SpanishForkBill[];
  autoTransfersPb: AutoTransfer[];
  billsAccountBills: BillOrSubWithMeta[];
  billsAccountSubs: BillOrSubWithMeta[];
  checkingAccountBills: BillOrSubWithMeta[];
  checkingAccountSubs: BillOrSubWithMeta[];
  spanishForkBills: SpanishForkBill[];
  autoTransfers: AutoTransfer[];
  monthlySpendingBySection: Map<string, number>;
  paidThisMonthByBill: Map<string, number>;
  paidBreakdownByBill: Map<string, import("@/lib/statementTagging").ActualBreakdownItem[]>;
  paycheckPaidThisMonth?: number;
  paycheckConfigs: Awaited<ReturnType<typeof getPaychecks>>;
  moneyStatus: import("@/lib/summaryCalculations").MoneyStatus;
  paycheckEndDate: Date | null;
  spanishForkGrossNeed: number;
  tenantRentMonthly: number | null;
}) {
  return (
    <main className="min-h-screen pb-safe relative">
      {/* Background GIF */}
      <div className="fixed inset-0 z-0 overflow-hidden">
        <img src="/background.gif" alt="" className="w-full h-full object-cover" />
        <div className="absolute inset-0 bg-gradient-to-br from-sky-50/80 via-white/60 to-neutral-50/80 dark:from-neutral-900/90 dark:via-neutral-950/90 dark:to-neutral-950/90" />
      </div>
      {/* Header - sticky on mobile */}
      <header className="sticky top-0 z-50 bg-neutral-100/95 dark:bg-neutral-900/95 backdrop-blur supports-[backdrop-filter]:bg-neutral-100/80 dark:supports-[backdrop-filter]:bg-neutral-900/80 border-b border-neutral-200 dark:border-neutral-800 px-4 pt-10 pb-3 safe-area-inset-top">
        <div className="flex items-center justify-between gap-2">
          <h1 className="text-xl font-semibold text-neutral-900 dark:text-neutral-100 shrink-0">
            Neu Money Tracking
          </h1>
          <div className="flex items-center gap-2 shrink-0">
            {hasPb && <HeaderAuth />}
            <HeaderPreferencesMenu />
          </div>
        </div>
        <p className="text-sm text-neutral-600 dark:text-neutral-400 mt-1.5 w-full">
          Take a breath. Let&apos;s look at the numbers together.
        </p>
      </header>

      <div className="relative z-10 p-4 space-y-6 max-w-2xl mx-auto">
        {/* Next paychecks: today vs each person's next pay date */}
        <NextPaychecksCard
          today={today}
          paycheckPaidThisMonth={paycheckPaidThisMonth}
          paycheckConfigs={paycheckConfigs}
        />

        {/* GoalsProvider shares goals state between SummaryCard and GoalsSection
            so that changing a monthly contribution instantly updates the left over */}
        <GoalsProvider initialGoals={goals}>
          {/* Current money status - flow and per-account */}
          <SummaryCard moneyStatus={moneyStatus} />

          {/* Current money goals */}
          <GoalsSection />
        </GoalsProvider>

        {/* Sections: from PocketBase when hasPb (use default order if sections empty), else static. Draggable when hasPb. */}
        {hasPb ? (
          <DraggableSectionCards sections={sectionsToRender}>
            {sectionsToRender.map((section) => {
              if (section.type === "bills_list" && section.account && section.listType) {
                const filtered = filterBillsWithMeta(
                  billsWithMeta,
                  section.account as BillListAccount,
                  section.listType as BillListType
                );
                const { items, groupKeyToDisplayName } = groupBillsBySubsection(filtered);
                const sectionKey = `${section.account}|${section.listType}`;
                const prefix = sectionKey + "|";
                const monthlySpending = monthlySpendingBySection.get(sectionKey) ?? 0;
                const paidByName: Record<string, number> = {};
                const breakdownByName: Record<string, import("@/lib/statementTagging").ActualBreakdownItem[]> = {};
                for (const b of filtered) {
                  const groupKey =
                    b.subsection && b.subsection.trim()
                      ? b.subsection.trim()
                      : normalizeKeyForGrouping(b.name);
                  const displayName = groupKeyToDisplayName.get(groupKey) ?? b.name;
                  const nameLower = b.name.toLowerCase();
                  // Primary lookup: exact section+name match
                  const paidKey = `${sectionKey}|${nameLower}`;
                  let v = paidThisMonthByBill.get(paidKey);
                  let breakdownList = paidBreakdownByBill.get(paidKey);
                  // Fallback: scan all actuals for any entry whose name part matches (handles section mismatch from tagging)
                  if (v === undefined) {
                    for (const [k, amt] of paidThisMonthByBill) {
                      const parts = k.split("|");
                      if (parts.length >= 3 && parts.slice(2).join("|") === nameLower) {
                        v = (v ?? 0) + amt;
                        const bd = paidBreakdownByBill.get(k);
                        if (bd?.length) breakdownList = [...(breakdownList ?? []), ...bd];
                      }
                    }
                  }
                  if (v !== undefined)
                    paidByName[displayName] = (paidByName[displayName] ?? 0) + v;
                  if (breakdownList?.length) {
                    const existing = breakdownByName[displayName] ?? [];
                    breakdownByName[displayName] = [...existing, ...breakdownList];
                  }
                }
                return (
                  <BillsList
                    key={section.id}
                    title={section.title}
                    subtitle={section.subtitle ?? undefined}
                    items={items}
                    monthlySpending={monthlySpending}
                    paidByName={paidByName}
                    breakdownByName={breakdownByName}
                    canDelete
                    paycheckEndDate={paycheckEndDate}
                  />
                );
              }
              if (section.type === "spanish_fork") {
                const sfPaidByName: Record<string, number> = {};
                const sfBreakdownByName: Record<string, import("@/lib/statementTagging").ActualBreakdownItem[]> = {};
                for (const [k, v] of paidThisMonthByBill) {
                  if (k.startsWith("spanish_fork|bills|")) {
                    const name = k.slice("spanish_fork|bills|".length);
                    sfPaidByName[name] = v;
                  }
                }
                for (const [k, itemsList] of paidBreakdownByBill) {
                  if (k.startsWith("spanish_fork|bills|")) {
                    const name = k.slice("spanish_fork|bills|".length);
                    sfBreakdownByName[name] = itemsList;
                  }
                }
                return (
                  <SpanishForkSection
                    key={section.id}
                    bills={spanishForkPb}
                    title={section.title}
                    subtitle={section.subtitle ?? undefined}
                    paidThisMonth={monthlySpendingBySection.get("spanish_fork|bills") ?? 0}
                    paidByName={sfPaidByName}
                    breakdownByName={sfBreakdownByName}
                    editableTenantPaid
                    canDelete
                    tenantRentMonthly={tenantRentMonthly}
                    spanishForkGrossNeed={spanishForkGrossNeed}
                    canEditTenantRent
                  />
                );
              }
              if (section.type === "auto_transfers") {
                return (
                  <AutoTransfersSection
                    key={section.id}
                    transfers={autoTransfersPb}
                    title={section.title}
                    subtitle={section.subtitle ?? undefined}
                  />
                );
              }
              return null;
            })}
          </DraggableSectionCards>
        ) : (
          <>
            <BillsList
              title="Bills (Bills Account)"
              subtitle="Oklahoma bills"
              items={billsAccountBills}
              monthlySpending={monthlySpendingBySection.get("bills_account|bills") ?? 0}
              paidByName={Object.fromEntries(
                [...paidThisMonthByBill.entries()]
                  .filter(([k]) => k.startsWith("bills_account|bills|"))
                  .map(([k, v]) => [k.slice("bills_account|bills|".length), v])
              )}
              breakdownByName={Object.fromEntries(
                [...paidBreakdownByBill.entries()]
                  .filter(([k]) => k.startsWith("bills_account|bills|"))
                  .map(([k, v]) => [k.slice("bills_account|bills|".length), v])
              )}
            />
            <BillsList
              title="Subscriptions (Bills Account)"
              items={billsAccountSubs}
              monthlySpending={monthlySpendingBySection.get("bills_account|subscriptions") ?? 0}
              paidByName={Object.fromEntries(
                [...paidThisMonthByBill.entries()]
                  .filter(([k]) => k.startsWith("bills_account|subscriptions|"))
                  .map(([k, v]) => [k.slice("bills_account|subscriptions|".length), v])
              )}
              breakdownByName={Object.fromEntries(
                [...paidBreakdownByBill.entries()]
                  .filter(([k]) => k.startsWith("bills_account|subscriptions|"))
                  .map(([k, v]) => [k.slice("bills_account|subscriptions|".length), v])
              )}
            />
            <BillsList
              title="Bills (Checking Account)"
              subtitle="Checking bills"
              items={checkingAccountBills}
              monthlySpending={monthlySpendingBySection.get("checking_account|bills") ?? 0}
              paidByName={Object.fromEntries(
                [...paidThisMonthByBill.entries()]
                  .filter(([k]) => k.startsWith("checking_account|bills|"))
                  .map(([k, v]) => [k.slice("checking_account|bills|".length), v])
              )}
              breakdownByName={Object.fromEntries(
                [...paidBreakdownByBill.entries()]
                  .filter(([k]) => k.startsWith("checking_account|bills|"))
                  .map(([k, v]) => [k.slice("checking_account|bills|".length), v])
              )}
            />
            <BillsList
              title="Subscriptions (Checking Account)"
              items={checkingAccountSubs}
              monthlySpending={monthlySpendingBySection.get("checking_account|subscriptions") ?? 0}
              paidByName={Object.fromEntries(
                [...paidThisMonthByBill.entries()]
                  .filter(([k]) => k.startsWith("checking_account|subscriptions|"))
                  .map(([k, v]) => [k.slice("checking_account|subscriptions|".length), v])
              )}
              breakdownByName={Object.fromEntries(
                [...paidBreakdownByBill.entries()]
                  .filter(([k]) => k.startsWith("checking_account|subscriptions|"))
                  .map(([k, v]) => [k.slice("checking_account|subscriptions|".length), v])
              )}
            />
            <SpanishForkSection
              bills={spanishForkBills}
              paidThisMonth={monthlySpendingBySection.get("spanish_fork|bills") ?? 0}
              paidByName={Object.fromEntries(
                [...paidThisMonthByBill.entries()]
                  .filter(([k]) => k.startsWith("spanish_fork|bills|"))
                  .map(([k, v]) => [k.slice("spanish_fork|bills|".length), v])
              )}
              breakdownByName={Object.fromEntries(
                [...paidBreakdownByBill.entries()]
                  .filter(([k]) => k.startsWith("spanish_fork|bills|"))
                  .map(([k, v]) => [k.slice("spanish_fork|bills|".length), v])
              )}
              editableTenantPaid={false}
              tenantRentMonthly={tenantRentMonthly}
              spanishForkGrossNeed={spanishForkGrossNeed}
            />
            <AutoTransfersSection transfers={autoTransfers} />
          </>
        )}
      </div>
    </main>
  );
}
