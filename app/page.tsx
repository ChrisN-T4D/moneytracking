import { SummaryCard } from "@/components/SummaryCard";
import { NextPaychecksCard } from "@/components/NextPaychecksCard";
import { BillsList } from "@/components/BillsList";
import { SpanishForkSection } from "@/components/SpanishForkSection";
import { AutoTransfersSection } from "@/components/AutoTransfersSection";
import { GoalsSection } from "@/components/GoalsSection";
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
import { computeLastMonthActuals } from "@/lib/statementTagging";
import { getPaycheckDepositsThisMonth } from "@/lib/statementsAnalysis";

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

  // Calculate monthly spending per section
  const monthlySpendingBySection = new Map<string, number>();
  for (const row of lastMonthActuals) {
    const key = `${row.section}|${row.listType ?? "bills"}`;
    const current = monthlySpendingBySection.get(key) ?? 0;
    monthlySpendingBySection.set(key, current + row.actualAmount);
  }

  // Paycheck deposits this month (for "Paid this month" in paychecks section):
  // (1) from imported statements that look like paychecks, (2) from paychecks added via modal with paidThisMonthYearMonth set
  const currentYearMonth = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, "0")}`;
  const fromStatements =
    hasPb && statements.length > 0 ? getPaycheckDepositsThisMonth(statements, today) : 0;
  const fromAddedPaychecks =
    hasPb && paycheckConfigs.length > 0
      ? paycheckConfigs
          .filter((p) => p.paidThisMonthYearMonth === currentYearMonth && (p.amountPaidThisMonth ?? 0) > 0)
          .reduce((sum, p) => sum + (p.amountPaidThisMonth ?? 0), 0)
      : 0;
  const paycheckPaidThisMonth = fromStatements + fromAddedPaychecks;

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
          paycheckPaidThisMonth={paycheckPaidThisMonth}
          paycheckConfigs={paycheckConfigs}
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
  paycheckPaidThisMonth,
  paycheckConfigs,
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
  paycheckPaidThisMonth?: number;
  paycheckConfigs: Awaited<ReturnType<typeof getPaychecks>>;
}) {
  return (
    <main className="min-h-screen pb-safe bg-neutral-100 dark:bg-neutral-900">
      {/* Header - sticky on mobile */}
      <header className="sticky top-0 z-10 bg-neutral-100/95 dark:bg-neutral-900/95 backdrop-blur supports-[backdrop-filter]:bg-neutral-100/80 dark:supports-[backdrop-filter]:bg-neutral-900/80 border-b border-neutral-200 dark:border-neutral-800 px-4 py-3 safe-area-inset-top">
        <div className="flex items-baseline justify-between gap-2">
          <div>
            <h1 className="text-xl font-semibold text-neutral-900 dark:text-neutral-100">
              Neu Money Tracking
            </h1>
            <p className="text-sm text-neutral-600 dark:text-neutral-400 mt-0.5">
              Take a breath. Let&apos;s look at the numbers together.
            </p>
          </div>
          <div className="flex items-center gap-2">
            {hasPb && <HeaderAuth />}
            <HeaderPreferencesMenu />
          </div>
        </div>
      </header>

      <div className="p-4 space-y-6 max-w-2xl mx-auto">
        {/* Next paychecks: today vs each person's next pay date */}
        <NextPaychecksCard
          today={today}
          paycheckPaidThisMonth={paycheckPaidThisMonth}
          paycheckConfigs={paycheckConfigs}
        />

        {/* Summary - most important on mobile */}
        <SummaryCard summary={summary} />

        {/* Current money goals */}
        <GoalsSection goals={goals} />

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
              return (
                <BillsList
                  key={section.id}
                  title={section.title}
                  subtitle={section.subtitle ?? undefined}
                  items={items}
                  monthlySpending={monthlySpending}
                />
              );
            }
            if (section.type === "spanish_fork") {
              return (
                <SpanishForkSection
                  key={section.id}
                  bills={spanishForkPb}
                  title={section.title}
                  subtitle={section.subtitle ?? undefined}
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
            />
            <BillsList
              title="Subscriptions (Bills Account)"
              items={billsAccountSubs}
              monthlySpending={monthlySpendingBySection.get("bills_account|subscriptions") ?? 0}
            />
            <BillsList
              title="Bills (Checking Account)"
              subtitle="Checking bills"
              items={checkingAccountBills}
              monthlySpending={monthlySpendingBySection.get("checking_account|bills") ?? 0}
            />
            <BillsList
              title="Subscriptions (Checking Account)"
              items={checkingAccountSubs}
              monthlySpending={monthlySpendingBySection.get("checking_account|subscriptions") ?? 0}
            />
            <SpanishForkSection bills={spanishForkBills} />
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
