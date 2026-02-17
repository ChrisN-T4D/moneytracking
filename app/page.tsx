import Link from "next/link";
import { SummaryCard } from "@/components/SummaryCard";
import { NextPaychecksCard } from "@/components/NextPaychecksCard";
import { BillsList } from "@/components/BillsList";
import { SpanishForkSection } from "@/components/SpanishForkSection";
import { AutoTransfersSection } from "@/components/AutoTransfersSection";
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
} from "@/lib/pocketbase";
import { getNextPaychecks } from "@/lib/paycheckConfig";
import type { BillListAccount, BillListType } from "@/lib/types";

export default async function Home() {
  const today = new Date();
  const hasPb = Boolean(process.env.NEXT_PUBLIC_POCKETBASE_URL);

  const [paycheckConfigs, sections, billsWithMeta, autoTransfersPb, spanishForkPb, summaryPb] =
    hasPb
      ? await Promise.all([
          getPaychecks(),
          getSections(),
          getBillsWithMeta(),
          getAutoTransfers(),
          getSpanishForkBills(),
          getSummary(),
        ])
      : [
          await getPaychecks(),
          [],
          [] as Awaited<ReturnType<typeof getBillsWithMeta>>,
          [],
          [],
          null,
        ];

  const nextPaychecks = getNextPaychecks(paycheckConfigs, today);
  const usePb = hasPb && sections.length > 0;
  const summary = usePb && summaryPb ? summaryPb : initialSummary;

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
              Bills, paychecks, and leftovers
            </p>
          </div>
          <Link
            href="/statements"
            className="text-sm font-medium text-neutral-600 dark:text-neutral-400 hover:text-neutral-900 dark:hover:text-neutral-100 whitespace-nowrap"
          >
            Statements
          </Link>
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
      </div>
    </main>
  );
}
