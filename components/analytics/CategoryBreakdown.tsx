"use client";

import { formatCurrency } from "@/lib/format";
import type { StatementAnalytics } from "@/lib/statementAnalytics";
import type { AnalyticsCadenceFilter } from "./CadenceOverview";

type CategoryBreakdownProps = {
  analytics: StatementAnalytics;
  selectedCadence: AnalyticsCadenceFilter;
};

function categoryRows(analytics: StatementAnalytics, selectedCadence: AnalyticsCadenceFilter) {
  if (!selectedCadence) return analytics.byCategory;
  return analytics.byCategoryByCadence[selectedCadence] ?? [];
}

export function CategoryBreakdown({ analytics, selectedCadence }: CategoryBreakdownProps) {
  const rows = categoryRows(analytics, selectedCadence).slice(0, 10);
  const total = rows.reduce((sum, row) => sum + row.amount, 0);
  const maxAmount = Math.max(...rows.map((row) => row.amount), 1);

  return (
    <section className="rounded-2xl border border-neutral-200 dark:border-neutral-700 bg-white dark:bg-neutral-900 p-4 shadow-sm">
      <div>
        <h2 className="text-sm font-semibold text-neutral-900 dark:text-neutral-100">
          Category breakdown
        </h2>
        <p className="mt-1 text-xs text-neutral-500 dark:text-neutral-400">
          {selectedCadence ? `${selectedCadence} expenses by category.` : "Top expense categories by outflow."}
        </p>
      </div>

      {rows.length === 0 ? (
        <p className="mt-4 text-sm text-neutral-500 dark:text-neutral-400">No category data yet.</p>
      ) : (
        <div className="mt-4 space-y-3">
          {rows.map((row) => {
            const share = total > 0 ? Math.round((row.amount / total) * 100) : 0;
            const width = Math.max(4, (row.amount / maxAmount) * 100);

            return (
              <div key={row.category}>
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <p className="text-sm font-medium text-neutral-800 dark:text-neutral-100">
                      {row.category}
                    </p>
                    <p className="text-xs text-neutral-500 dark:text-neutral-400">
                      {row.count} transaction{row.count === 1 ? "" : "s"} / {share}%
                    </p>
                  </div>
                  <p className="text-sm font-semibold tabular-nums text-neutral-900 dark:text-neutral-100">
                    {formatCurrency(row.amount)}
                  </p>
                </div>
                <div className="mt-2 h-2 overflow-hidden rounded-full bg-neutral-100 dark:bg-neutral-800">
                  <div className="h-full rounded-full bg-sky-500" style={{ width: `${width}%` }} />
                </div>
              </div>
            );
          })}
        </div>
      )}
    </section>
  );
}
