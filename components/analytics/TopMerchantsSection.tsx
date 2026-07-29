"use client";

import { formatCurrency } from "@/lib/format";
import type { StatementAnalytics } from "@/lib/statementAnalytics";
import type { AnalyticsCadenceFilter } from "./CadenceOverview";

type TopMerchantsSectionProps = {
  analytics: StatementAnalytics;
  selectedCadence: AnalyticsCadenceFilter;
};

export function TopMerchantsSection({ analytics, selectedCadence }: TopMerchantsSectionProps) {
  const rows = analytics.topMerchants
    .filter((merchant) => !selectedCadence || (merchant.cadence ?? "variable") === selectedCadence)
    .slice(0, 10);
  const maxAmount = Math.max(...rows.map((row) => row.amount), 1);

  return (
    <section className="rounded-2xl border border-neutral-200 dark:border-neutral-700 bg-white dark:bg-neutral-900 p-4 shadow-sm">
      <div>
        <h2 className="text-sm font-semibold text-neutral-900 dark:text-neutral-100">
          Top merchants
        </h2>
        <p className="mt-1 text-xs text-neutral-500 dark:text-neutral-400">
          Highest spend patterns from categorized expense rows.
        </p>
      </div>

      {rows.length === 0 ? (
        <p className="mt-4 text-sm text-neutral-500 dark:text-neutral-400">No merchant data yet.</p>
      ) : (
        <div className="mt-4 space-y-3">
          {rows.map((row) => {
            const width = Math.max(4, (row.amount / maxAmount) * 100);
            return (
              <div key={row.pattern} className="rounded-xl border border-neutral-200 dark:border-neutral-700 p-3">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium text-neutral-900 dark:text-neutral-100">
                      {row.pattern}
                    </p>
                    <p className="mt-0.5 text-xs text-neutral-500 dark:text-neutral-400">
                      {row.count} transaction{row.count === 1 ? "" : "s"} / {row.spendCategory ?? "Uncategorized"} / {row.cadence ?? "uncategorized"}
                    </p>
                  </div>
                  <p className="shrink-0 text-sm font-semibold tabular-nums text-neutral-900 dark:text-neutral-100">
                    {formatCurrency(row.amount)}
                  </p>
                </div>
                <div className="mt-3 h-2 overflow-hidden rounded-full bg-neutral-100 dark:bg-neutral-800">
                  <div className="h-full rounded-full bg-amber-500" style={{ width: `${width}%` }} />
                </div>
              </div>
            );
          })}
        </div>
      )}
    </section>
  );
}
