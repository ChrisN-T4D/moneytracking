"use client";

import { formatCurrency } from "@/lib/format";
import type { StatementAnalytics } from "@/lib/statementAnalytics";

export type AnalyticsCadenceFilter = "monthly" | "biweekly" | "variable" | null;

type CadenceOverviewProps = {
  analytics: StatementAnalytics;
  selectedCadence: AnalyticsCadenceFilter;
  onSelectCadence: (cadence: AnalyticsCadenceFilter) => void;
};

const CADENCE_LABELS: Record<Exclude<AnalyticsCadenceFilter, null>, string> = {
  monthly: "Monthly",
  biweekly: "Biweekly",
  variable: "Variable",
};

export function CadenceOverview({
  analytics,
  selectedCadence,
  onSelectCadence,
}: CadenceOverviewProps) {
  const total = analytics.byCadence.reduce((sum, item) => sum + item.amount, 0);
  const maxAmount = Math.max(...analytics.byCadence.map((item) => item.amount), 1);

  return (
    <section className="rounded-2xl border border-neutral-200 dark:border-neutral-700 bg-white dark:bg-neutral-900 p-4 shadow-sm">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h2 className="text-sm font-semibold text-neutral-900 dark:text-neutral-100">
            Cadence overview
          </h2>
          <p className="mt-1 text-xs text-neutral-500 dark:text-neutral-400">
            Expense outflow grouped by recurring pattern.
          </p>
        </div>
        <button
          type="button"
          onClick={() => onSelectCadence(null)}
          className={`rounded-lg border px-3 py-1.5 text-xs font-medium ${
            selectedCadence === null
              ? "border-emerald-500 bg-emerald-50 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-200"
              : "border-neutral-300 text-neutral-600 hover:bg-neutral-100 dark:border-neutral-600 dark:text-neutral-300 dark:hover:bg-neutral-800"
          }`}
        >
          All
        </button>
      </div>

      <div className="mt-4 space-y-3">
        {analytics.byCadence.map((item) => {
          const cadence = item.cadence as Exclude<AnalyticsCadenceFilter, null>;
          const share = total > 0 ? Math.round((item.amount / total) * 100) : 0;
          const width = Math.max(4, (item.amount / maxAmount) * 100);
          const selected = selectedCadence === cadence;

          return (
            <button
              key={item.cadence}
              type="button"
              onClick={() => onSelectCadence(selected ? null : cadence)}
              className={`w-full rounded-xl border p-3 text-left transition ${
                selected
                  ? "border-emerald-500 bg-emerald-50 dark:bg-emerald-950/40"
                  : "border-neutral-200 hover:bg-neutral-50 dark:border-neutral-700 dark:hover:bg-neutral-800/70"
              }`}
            >
              <div className="flex items-center justify-between gap-3">
                <div>
                  <p className="text-sm font-medium text-neutral-900 dark:text-neutral-100">
                    {CADENCE_LABELS[cadence] ?? item.cadence}
                  </p>
                  <p className="text-xs text-neutral-500 dark:text-neutral-400">
                    {item.count} transaction{item.count === 1 ? "" : "s"} / {share}% of outflow
                  </p>
                </div>
                <p className="text-sm font-semibold tabular-nums text-neutral-900 dark:text-neutral-100">
                  {formatCurrency(item.amount)}
                </p>
              </div>
              <div className="mt-3 h-2 overflow-hidden rounded-full bg-neutral-100 dark:bg-neutral-800">
                <div className="h-full rounded-full bg-emerald-500" style={{ width: `${width}%` }} />
              </div>
            </button>
          );
        })}
      </div>
    </section>
  );
}
