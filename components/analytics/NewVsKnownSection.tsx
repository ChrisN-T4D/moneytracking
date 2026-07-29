"use client";

import { formatCurrency } from "@/lib/format";
import type { StatementAnalytics } from "@/lib/statementAnalytics";
import type { AnalyticsCadenceFilter } from "./CadenceOverview";

type NewVsKnownSectionProps = {
  analytics: StatementAnalytics;
  selectedCadence: AnalyticsCadenceFilter;
};

function formatDateTime(value: string | null): string {
  if (!value) return "Never";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString("en-US", {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

export function NewVsKnownSection({ analytics, selectedCadence }: NewVsKnownSectionProps) {
  const newRows = selectedCadence
    ? (analytics.newSinceLastImportByCadence[selectedCadence] ?? [])
    : analytics.newSinceLastImport;
  const rows = newRows.slice(0, 8);
  const maxAmount = Math.max(...rows.map((row) => row.amount), 1);
  const newCount = newRows.reduce((sum, row) => sum + row.count, 0);
  const expenseRowCount = selectedCadence
    ? (analytics.byCadence.find((item) => item.cadence === selectedCadence)?.count ?? 0)
    : analytics.byCadence.reduce((sum, item) => sum + item.count, 0);
  const knownCount = Math.max(expenseRowCount - newCount, 0);

  return (
    <section className="rounded-2xl border border-neutral-200 dark:border-neutral-700 bg-white dark:bg-neutral-900 p-4 shadow-sm">
      <div>
        <h2 className="text-sm font-semibold text-neutral-900 dark:text-neutral-100">
          New vs known
        </h2>
        <p className="mt-1 text-xs text-neutral-500 dark:text-neutral-400">
          {selectedCadence
            ? `New ${selectedCadence} merchant patterns from the latest source file.`
            : "New merchant patterns from the latest source file."}
        </p>
      </div>

      <div className="mt-4 grid grid-cols-2 gap-2">
        <div className="rounded-xl border border-neutral-200 dark:border-neutral-700 p-3">
          <p className="text-xs text-neutral-500 dark:text-neutral-400">New pattern rows</p>
          <p className="mt-1 text-lg font-semibold tabular-nums text-neutral-900 dark:text-neutral-100">
            {newCount}
          </p>
        </div>
        <div className="rounded-xl border border-neutral-200 dark:border-neutral-700 p-3">
          <p className="text-xs text-neutral-500 dark:text-neutral-400">Known rows</p>
          <p className="mt-1 text-lg font-semibold tabular-nums text-neutral-900 dark:text-neutral-100">
            {knownCount}
          </p>
        </div>
      </div>

      <div className="mt-3 rounded-xl border border-neutral-200 dark:border-neutral-700 p-3">
        <div className="flex items-center justify-between gap-3 text-xs">
          <span className="text-neutral-500 dark:text-neutral-400">Uncategorized rows</span>
          <span className="font-semibold tabular-nums text-neutral-900 dark:text-neutral-100">
            {analytics.uncategorizedCount}
          </span>
        </div>
        <div className="mt-2 flex items-center justify-between gap-3 text-xs">
          <span className="text-neutral-500 dark:text-neutral-400">Last categorized</span>
          <span className="font-medium text-neutral-700 dark:text-neutral-200">
            {formatDateTime(analytics.meta.lastCategorizedAt)}
          </span>
        </div>
      </div>

      {rows.length > 0 && (
        <div className="mt-4 space-y-3">
          {rows.map((row) => {
            const width = Math.max(4, (row.amount / maxAmount) * 100);
            return (
              <div key={row.pattern}>
                <div className="flex items-center justify-between gap-3">
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium text-neutral-900 dark:text-neutral-100">
                      {row.pattern}
                    </p>
                    <p className="text-xs text-neutral-500 dark:text-neutral-400">
                      {row.count} transaction{row.count === 1 ? "" : "s"}
                    </p>
                  </div>
                  <span className="text-sm font-semibold tabular-nums text-neutral-900 dark:text-neutral-100">
                    {formatCurrency(row.amount)}
                  </span>
                </div>
                <div className="mt-2 h-2 overflow-hidden rounded-full bg-neutral-100 dark:bg-neutral-800">
                  <div className="h-full rounded-full bg-rose-500" style={{ width: `${width}%` }} />
                </div>
              </div>
            );
          })}
        </div>
      )}
    </section>
  );
}
