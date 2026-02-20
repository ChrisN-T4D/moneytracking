"use client";

import { formatCurrency } from "@/lib/format";

interface IncomeVsNeededChartProps {
  /** Expected income for CURRENT month (paychecks) — used for left over */
  incomeCurrentMonth: number;
  /** Expected income for NEXT month (paychecks) — shown for comparison */
  incomeNextMonth?: number;
  /** Name of next month e.g. "March" */
  nextMonthName?: string;
  /** Total needed (bills + subs + Spanish Fork, monthly equivalent) — same for any month */
  totalNeeded: number;
  /** Left over for CURRENT month only (income - obligations) */
  leftOver: number;
  /** Current month name e.g. "February" */
  currentMonthName?: string;
}

/**
 * Income vs Needed: shows income for both current and next month, needed once,
 * and left over for the current month only. Color-coded (green = extra, red = short).
 */
export function IncomeVsNeededChart({
  incomeCurrentMonth,
  incomeNextMonth,
  nextMonthName,
  totalNeeded,
  leftOver,
  currentMonthName,
}: IncomeVsNeededChartProps) {
  const max = Math.max(incomeCurrentMonth, incomeNextMonth ?? 0, totalNeeded, 1);
  const incomeCurPct = (incomeCurrentMonth / max) * 100;
  const incomeNextPct = ((incomeNextMonth ?? 0) / max) * 100;
  const neededPct = (totalNeeded / max) * 100;
  const hasSurplus = leftOver >= 0;

  return (
    <div className="mt-4 rounded-lg bg-neutral-100/80 dark:bg-neutral-800/50 px-3 py-3">
      <h3 className="text-xs font-medium text-neutral-500 dark:text-neutral-400 uppercase tracking-wide mb-3">
        Income vs needed
      </h3>

      {/* Income — current month */}
      <div className="mb-1.5">
        <div className="flex justify-between text-xs mb-0.5">
          <span className="text-neutral-600 dark:text-neutral-400">
            Income ({currentMonthName ?? "this month"})
          </span>
          <span className="font-medium tabular-nums text-neutral-800 dark:text-neutral-200">
            {formatCurrency(incomeCurrentMonth)}
          </span>
        </div>
        <div className="h-2.5 w-full rounded-full bg-neutral-200 dark:bg-neutral-700 overflow-hidden">
          <div
            className="h-full rounded-full bg-sky-500 dark:bg-sky-600 transition-[width] duration-300"
            style={{ width: `${Math.min(incomeCurPct, 100)}%` }}
          />
        </div>
      </div>

      {/* Income — next month (when provided) */}
      {incomeNextMonth != null && incomeNextMonth > 0 && (
        <div className="mb-1.5">
          <div className="flex justify-between text-xs mb-0.5">
            <span className="text-neutral-600 dark:text-neutral-400">
              Income ({nextMonthName ?? "next month"})
            </span>
            <span className="font-medium tabular-nums text-neutral-800 dark:text-neutral-200">
              {formatCurrency(incomeNextMonth)}
            </span>
          </div>
          <div className="h-2.5 w-full rounded-full bg-neutral-200 dark:bg-neutral-700 overflow-hidden">
            <div
              className="h-full rounded-full bg-sky-400/80 dark:bg-sky-500/80 transition-[width] duration-300"
              style={{ width: `${Math.min(incomeNextPct, 100)}%` }}
            />
          </div>
        </div>
      )}

      {/* Needed — same every month */}
      <div className="mb-3">
        <div className="flex justify-between text-xs mb-0.5">
          <span className="text-neutral-600 dark:text-neutral-400">Needed (monthly)</span>
          <span className="font-medium tabular-nums text-neutral-800 dark:text-neutral-200">
            {formatCurrency(totalNeeded)}
          </span>
        </div>
        <div className="h-2.5 w-full rounded-full bg-neutral-200 dark:bg-neutral-700 overflow-hidden">
          <div
            className={`h-full rounded-full transition-[width] duration-300 ${
              totalNeeded > incomeCurrentMonth
                ? "bg-red-500 dark:bg-red-600"
                : "bg-neutral-400 dark:bg-neutral-500"
            }`}
            style={{ width: `${Math.min(neededPct, 100)}%` }}
          />
        </div>
      </div>

      {/* Left over — current month only */}
      <div
        className={`flex justify-between items-baseline rounded-md px-2.5 py-1.5 ${
          hasSurplus
            ? "bg-emerald-100 dark:bg-emerald-900/40 text-emerald-800 dark:text-emerald-200"
            : "bg-red-100 dark:bg-red-900/40 text-red-800 dark:text-red-200"
        }`}
      >
        <span className="text-sm font-medium">
          {hasSurplus ? "Extra" : "Short"} ({currentMonthName ?? "this month"})
        </span>
        <span className="text-lg font-bold tabular-nums">
          {formatCurrency(leftOver)}
        </span>
      </div>
    </div>
  );
}
