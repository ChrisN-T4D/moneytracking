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
  getAutoTransfers,
  getSpanishForkBills,
  getSummary,
  getStatements,
  getStatementTagRules,
  getGoals,
} from "@/lib/pocketbase";
import type { BillListAccount, BillListType } from "@/lib/types";
import { computeLastMonthActuals, computeThisMonthActuals } from "@/lib/statementTagging";
import { getPaycheckDepositsThisMonth } from "@/lib/statementsAnalysis";
import {
  predictedNeedByAccountFromPb,
  predictedNeedByAccountFromLists,
  autoTransfersMonthlyByAccount,
  expectedPaychecksThisMonthDetail,
  computeMoneyStatus,
} from "@/lib/summaryCalculations";

export const dynamic = "force-dynamic";

export default async function Home() {
  const today = new Date();
  const hasPb = Boolean(process.env.NEXT_PUBLIC_POCKETBASE_URL);

  const [
    paycheckConfigs,
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
          getPaychecks(),
          getSections(),
          getBillsWithMeta(),
          getAutoTransfers(),
          getSpanishForkBills(),
          getSummary(),
          getStatements({ perPage: 1000, sort: "-date" }),
          getStatementTagRules(),
          getGoals(),
        ])
      : [
          await getPaychecks(),
          [],
          [] as Awaited<ReturnType<typeof getBillsWithMeta>>,
          [],
          [],
          null,
          [],
          [],
          [],
        ];

  const usePb = hasPb && sections.length > 0;
  const summary = usePb && summaryPb ? summaryPb : initialSummary;
  const { monthName, rows: lastMonthActuals } =
    hasPb && statements.length > 0 && tagRules.length > 0
      ? computeLastMonthActuals(statements, tagRules, today)
      : { monthName: "", rows: [] };

  // This month: tagged statements count toward each subsection's "paid this month" (compare budget vs actual).
  const thisMonthActuals =
    hasPb && statements.length > 0 && tagRules.length > 0
      ? computeThisMonthActuals(statements, tagRules, today)
      : [];
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

  // Compute additional goal progress from statements tagged with a goalId.
  const goalProgressById = new Map<string, number>();
  for (const s of statements) {
    const gid = s.goalId;
    if (!gid) continue;
    const prev = goalProgressById.get(gid) ?? 0;
    // Treat any movement toward a goal as positive progress.
    const contribution = Math.abs(s.amount);
    goalProgressById.set(gid, prev + contribution);
  }

  const baseGoals = hasPb && goalsPb.length > 0 ? goalsPb : staticGoals;
  const goals = baseGoals.map((g) => ({
    ...g,
    currentAmount: (g.currentAmount ?? 0) + (goalProgressById.get(g.id) ?? 0),
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
  const predictedNeed = usePb
    ? predictedNeedByAccountFromPb(billsWithMeta, spanishForkPb)
    : predictedNeedByAccountFromLists(
        billsAccountBills,
        billsAccountSubs,
        checkingAccountBills,
        checkingAccountSubs,
        spanishForkBills
      );
  const autoTransfersMonthly = autoTransfersMonthlyByAccount(usePb ? autoTransfersPb : autoTransfers);
  // Show expected paychecks for NEXT month — money status is forward-looking (planning ahead for next month's bills).
  const nextMonth = new Date(today.getFullYear(), today.getMonth() + 1, 1);
  const { total: paychecksThisMonthExpected, payDates } = expectedPaychecksThisMonthDetail(paycheckConfigs, nextMonth);
  const forMonthName = nextMonth.toLocaleString("en-US", { month: "long" });
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
  const moneyStatus = computeMoneyStatus(predictedNeed, autoTransfersMonthly, paychecksThisMonthExpected, payDates, forMonthName, totalGoalContributions, accountBalances, paidThisMonthByAccount);

  return (
    <AuthenticatedContent>
      <MainContent
          hasPb={hasPb}
          today={today}
          summary={summary}
          goals={goals}
          usePb={usePb}
          sections={sections}
          billsWithMeta={billsWithMeta}
          spanishForkPb={spanishForkPb}
          autoTransfersPb={autoTransfersPb}
          billsAccountBills={billsAccountBills}
          billsAccountSubs={billsAccountSubs}
          checkingAccountBills={checkingAccountBills}
          checkingAccountSubs={checkingAccountSubs}
          spanishForkBills={spanishForkBills}
          autoTransfers={autoTransfers}
          lastMonthActuals={lastMonthActuals}
          monthName={monthName}
          monthlySpendingBySection={monthlySpendingBySection}
          paidThisMonthByBill={paidThisMonthByBill}
          paycheckPaidThisMonth={paycheckPaidThisMonth}
          paycheckConfigs={paycheckConfigs}
          moneyStatus={moneyStatus}
        />
      </AuthenticatedContent>
  );
}

function MainContent({
  hasPb,
  today,
  summary,
  goals,
  usePb,
  sections,
  billsWithMeta,
  spanishForkPb,
  autoTransfersPb,
  billsAccountBills,
  billsAccountSubs,
  checkingAccountBills,
  checkingAccountSubs,
  spanishForkBills,
  autoTransfers,
  lastMonthActuals,
  monthName,
  monthlySpendingBySection,
  paidThisMonthByBill,
  paycheckPaidThisMonth,
  paycheckConfigs,
  moneyStatus,
}: {
  hasPb: boolean;
  today: Date;
  summary: any;
  goals: any;
  usePb: boolean;
  sections: any;
  billsWithMeta: any;
  spanishForkPb: any;
  autoTransfersPb: any;
  billsAccountBills: any;
  billsAccountSubs: any;
  checkingAccountBills: any;
  checkingAccountSubs: any;
  spanishForkBills: any;
  autoTransfers: any;
  lastMonthActuals: any;
  monthName: string;
  paidThisMonthByBill: Map<string, number>;
  paycheckPaidThisMonth?: number;
  paycheckConfigs: Awaited<ReturnType<typeof getPaychecks>>;
  moneyStatus: import("@/lib/summaryCalculations").MoneyStatus;
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

        {/* Sections: from PocketBase when available, else static */}
        {usePb ? (
          sections.map((section) => {
            if (section.type === "bills_list" && section.account && section.listType) {
              const items = filterBillsWithMeta(
                billsWithMeta,
                section.account as BillListAccount,
                section.listType as BillListType
              );
              const sectionKey = `${section.account}|${section.listType}`;
              const monthlySpending = monthlySpendingBySection.get(sectionKey) ?? 0;
              const paidByName: Record<string, number> = {};
              for (const item of items) {
                const k = `${sectionKey}|${item.name.toLowerCase()}`;
                const v = paidThisMonthByBill.get(k);
                if (v !== undefined) paidByName[item.name] = v;
              }
              return (
                <BillsList
                  key={section.id}
                  title={section.title}
                  subtitle={section.subtitle ?? undefined}
                  items={items}
                  monthlySpending={monthlySpending}
                  paidByName={paidByName}
                />
              );
            }
            if (section.type === "spanish_fork") {
              const sfPaidByName: Record<string, number> = {};
              for (const [k, v] of paidThisMonthByBill) {
                if (k.startsWith("spanish_fork|bills|")) {
                  const name = k.slice("spanish_fork|bills|".length);
                  sfPaidByName[name] = v;
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
          })
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
            />
            <SpanishForkSection
              bills={spanishForkBills}
              paidThisMonth={monthlySpendingBySection.get("spanish_fork|bills") ?? 0}
              paidByName={Object.fromEntries(
                [...paidThisMonthByBill.entries()]
                  .filter(([k]) => k.startsWith("spanish_fork|bills|"))
                  .map(([k, v]) => [k.slice("spanish_fork|bills|".length), v])
              )}
            />
            <AutoTransfersSection transfers={autoTransfers} />
          </>
        )}

        {lastMonthActuals.length > 0 && (
          <section className="rounded-xl border border-neutral-200 dark:border-neutral-700 bg-white dark:bg-neutral-800/50 p-4 shadow-sm">
            <h2 className="text-base font-semibold text-neutral-800 dark:text-neutral-200">
              Actual {monthName}
            </h2>
            <p className="text-xs text-neutral-500 dark:text-neutral-400 mt-0.5">
              Sum of tagged statement rows for last month, by section.
            </p>
            <div className="mt-3 overflow-x-auto -mx-4 px-4">
              <table className="w-full min-w-[320px] text-sm">
                <thead>
                  <tr className="border-b border-neutral-200 dark:border-neutral-600 text-left text-xs text-neutral-500 dark:text-neutral-400">
                    <th className="py-2 pr-2 font-medium">Name</th>
                    <th className="py-2 pr-2 font-medium w-32">Section</th>
                    <th className="py-2 pr-2 font-medium w-24">Type</th>
                    <th className="py-2 font-medium text-right w-28">Actual</th>
                  </tr>
                </thead>
                <tbody>
                  {lastMonthActuals.map((row, i) => (
                    <tr
                      key={`${row.section}-${row.listType ?? "bills"}-${row.name}-${i}`}
                      className="border-b border-neutral-100 dark:border-neutral-700/50 last:border-0"
                    >
                      <td className="py-2.5 pr-2 text-neutral-800 dark:text-neutral-200">
                        {row.name}
                      </td>
                      <td className="py-2.5 pr-2 text-neutral-600 dark:text-neutral-400">
                        {row.section === "bills_account"
                          ? "Bills Account"
                          : row.section === "checking_account"
                          ? "Checking"
                          : "Spanish Fork"}
                      </td>
                      <td className="py-2.5 pr-2 text-neutral-600 dark:text-neutral-400">
                        {row.listType === "subscriptions" ? "Subscription" : "Bill"}
                      </td>
                      <td className="py-2.5 text-right font-medium tabular-nums text-neutral-800 dark:text-neutral-100">
                        {row.actualAmount.toFixed(2)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        )}
      </div>
    </main>
  );
}
