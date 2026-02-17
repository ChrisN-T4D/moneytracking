import Link from "next/link";
import { SummaryCard } from "@/components/SummaryCard";
import { NextPaychecksCard } from "@/components/NextPaychecksCard";
import { BillsList } from "@/components/BillsList";
import { SpanishForkSection } from "@/components/SpanishForkSection";
import { AutoTransfersSection } from "@/components/AutoTransfersSection";
import { AddItemsToBillsModal } from "@/components/AddItemsToBillsModal";
import { AuthProvider } from "@/components/AuthProvider";
import { ThemeProvider } from "@/components/ThemeProvider";
import { HeaderPreferencesMenu } from "@/components/HeaderPreferencesMenu";
import { HeaderAuth } from "@/components/HeaderAuth";
import {
  initialSummary,
  billsAccountBills,
  billsAccountSubs,
  checkingAccountBills,
  checkingAccountSubs,
  autoTransfers,
  spanishForkBills,
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
} from "@/lib/pocketbase";
import { getNextPaychecks } from "@/lib/paycheckConfig";
import type { BillListAccount, BillListType } from "@/lib/types";
import { computeLastMonthActuals } from "@/lib/statementTagging";

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
        ];

  const nextPaychecks = getNextPaychecks(paycheckConfigs, today);
  const usePb = hasPb && sections.length > 0;
  const summary = usePb && summaryPb ? summaryPb : initialSummary;
  const { monthName, rows: lastMonthActuals } =
    hasPb && statements.length > 0 && tagRules.length > 0
      ? computeLastMonthActuals(statements, tagRules, today)
      : { monthName: "", rows: [] };

  return (
    <AuthProvider>
      <ThemeProvider>
      <main className="min-h-screen pb-safe bg-neutral-100 dark:bg-neutral-900">
      {/* Header - sticky on mobile */}
      <header className="sticky top-0 z-10 bg-neutral-100/95 dark:bg-neutral-900/95 backdrop-blur supports-[backdrop-filter]:bg-neutral-100/80 dark:supports-[backdrop-filter]:bg-neutral-900/80 border-b border-neutral-200 dark:border-neutral-800 px-4 py-3 safe-area-inset-top">
        <div className="flex items-baseline justify-between gap-2">
          <div>
            <h1 className="text-xl font-semibold text-neutral-900 dark:text-neutral-100">
              Neu Money Tracking
            </h1>
            <p className="text-sm text-neutral-600 dark:text-neutral-400 mt-0.5">
              Bills, paychecks, and leftovers
            </p>
          </div>
          <div className="flex items-center gap-2">
            {hasPb && <AddItemsToBillsModal />}
            <Link
              href="/statements"
              className="text-sm font-medium text-neutral-600 dark:text-neutral-400 hover:text-neutral-900 dark:hover:text-neutral-100 whitespace-nowrap"
            >
              Statements
            </Link>
            {hasPb && <HeaderAuth />}
            <HeaderPreferencesMenu />
          </div>
        </div>
      </header>

      <div className="p-4 space-y-6 max-w-2xl mx-auto">
        {/* Next paychecks: today vs each person's next pay date */}
        <NextPaychecksCard today={today} paychecks={nextPaychecks} />

        {/* Summary - most important on mobile */}
        <SummaryCard summary={summary} />

        {/* Sections: from PocketBase when available, else static */}
        {usePb ? (
          sections.map((section) => {
            if (section.type === "bills_list" && section.account && section.listType) {
              const items = filterBillsWithMeta(
                billsWithMeta,
                section.account as BillListAccount,
                section.listType as BillListType
              );
              return (
                <BillsList
                  key={section.id}
                  title={section.title}
                  subtitle={section.subtitle ?? undefined}
                  items={items}
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
            />
            <BillsList
              title="Subscriptions (Bills Account)"
              items={billsAccountSubs}
            />
            <BillsList
              title="Bills (Checking Account)"
              subtitle="Checking bills"
              items={checkingAccountBills}
            />
            <BillsList
              title="Subscriptions (Checking Account)"
              items={checkingAccountSubs}
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
      </ThemeProvider>
    </AuthProvider>
  );
}
