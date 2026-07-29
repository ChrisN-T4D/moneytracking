"use client";

import { formatCurrency } from "@/lib/format";
import type { StatementAnalytics } from "@/lib/statementAnalytics";
import type { AnalyticsCadenceFilter } from "./CadenceOverview";

type TrendsSectionProps = {
  analytics: StatementAnalytics;
  selectedCadence: AnalyticsCadenceFilter;
};

function monthLabel(month: string): string {
  const [year, rawMonth] = month.split("-");
  const date = new Date(Number(year), Number(rawMonth) - 1, 1);
  if (Number.isNaN(date.getTime())) return month;
  return date.toLocaleDateString("en-US", { month: "short", year: "numeric" });
}

export function TrendsSection({ analytics, selectedCadence }: TrendsSectionProps) {
  const rows = analytics.trends
    .map((trend) => ({
      month: trend.month,
      amount: selectedCadence ? (trend.byCadence[selectedCadence] ?? 0) : trend.outflow,
    }))
    .filter((trend) => trend.amount > 0)
    .slice(-12);
  const maxAmount = Math.max(...rows.map((row) => row.amount), 1);

  return (
    <section className="rounded-2xl border border-neutral-200 dark:border-neutral-700 bg-white dark:bg-neutral-900 p-4 shadow-sm">
      <div>
        <h2 className="text-sm font-semibold text-neutral-900 dark:text-neutral-100">
          Trends
        </h2>
        <p className="mt-1 text-xs text-neutral-500 dark:text-neutral-400">
          {selectedCadence ? `${selectedCadence} outflow by month.` : "Monthly statement outflow."}
        </p>
      </div>

      {rows.length === 0 ? (
        <p className="mt-4 text-sm text-neutral-500 dark:text-neutral-400">No trend data yet.</p>
      ) : (
        <div className="mt-4 space-y-3">
          {rows.map((row) => {
            const width = Math.max(4, (row.amount / maxAmount) * 100);
            return (
              <div key={row.month} className="grid grid-cols-[76px_1fr_auto] items-center gap-3">
                <span className="text-xs font-medium text-neutral-500 dark:text-neutral-400">
                  {monthLabel(row.month)}
                </span>
                <div className="h-2 overflow-hidden rounded-full bg-neutral-100 dark:bg-neutral-800">
                  <div className="h-full rounded-full bg-violet-500" style={{ width: `${width}%` }} />
                </div>
                <span className="text-xs font-semibold tabular-nums text-neutral-800 dark:text-neutral-100">
                  {formatCurrency(row.amount)}
                </span>
              </div>
            );
          })}
        </div>
      )}
    </section>
  );
}
