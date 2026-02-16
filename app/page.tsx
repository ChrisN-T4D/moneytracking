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
import { getPaychecks } from "@/lib/pocketbase";
import { getNextPaychecks } from "@/lib/paycheckConfig";

export default async function Home() {
  const today = new Date();
  const paycheckConfigs = await getPaychecks();
  const nextPaychecks = getNextPaychecks(paycheckConfigs, today);

  return (
    <main className="min-h-screen pb-safe bg-neutral-100 dark:bg-neutral-900">
      {/* Header - sticky on mobile */}
      <header className="sticky top-0 z-10 bg-neutral-100/95 dark:bg-neutral-900/95 backdrop-blur supports-[backdrop-filter]:bg-neutral-100/80 dark:supports-[backdrop-filter]:bg-neutral-900/80 border-b border-neutral-200 dark:border-neutral-800 px-4 py-3 safe-area-inset-top">
        <h1 className="text-xl font-semibold text-neutral-900 dark:text-neutral-100">
          Neu Money Tracking
        </h1>
        <p className="text-sm text-neutral-600 dark:text-neutral-400 mt-0.5">
          Bills, paychecks, and leftovers
        </p>
      </header>

      <div className="p-4 space-y-6 max-w-2xl mx-auto">
        {/* Next paychecks: today vs each person's next pay date */}
        <NextPaychecksCard today={today} paychecks={nextPaychecks} />

        {/* Summary - most important on mobile */}
        <SummaryCard summary={initialSummary} />

        {/* Bills by account */}
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

        {/* Spanish Fork rental */}
        <SpanishForkSection bills={spanishForkBills} />

        {/* Auto transfers */}
        <AutoTransfersSection transfers={autoTransfers} />
      </div>
    </main>
  );
}
