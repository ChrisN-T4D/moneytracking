"use client";

import { formatCurrency } from "@/lib/format";
import type { Summary } from "@/lib/types";
import { getCardClasses, getSectionLabelClasses } from "@/lib/themePalettes";
import { useTheme } from "./ThemeProvider";

interface SummaryCardProps {
  summary: Summary;
}

export function SummaryCard({ summary }: SummaryCardProps) {
  const { theme } = useTheme();

  return (
    <section className={getCardClasses(theme.summary)}>
      <div>
        <h2 className={getSectionLabelClasses(theme.summary)}>
          Amount needed
        </h2>
        <div className="space-y-2 text-sm">
          <div className="flex justify-between">
            <span className="text-neutral-600 dark:text-neutral-400">Total needed</span>
            <span className="font-semibold">{formatCurrency(summary.totalNeeded)}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-neutral-600 dark:text-neutral-400">Oklahoma Bills acct</span>
            <span>{formatCurrency(summary.billsAccountNeeded)}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-neutral-600 dark:text-neutral-400">Checking acct</span>
            <span>{formatCurrency(summary.checkingAccountNeeded)}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-neutral-600 dark:text-neutral-400">Spanish Fork</span>
            <span>{formatCurrency(summary.spanishForkNeeded)}</span>
          </div>
          <div className="flex justify-between text-xs text-neutral-500">
            <span>Bills subs</span>
            <span>{formatCurrency(summary.billsSubscriptions)}</span>
          </div>
          <div className="flex justify-between text-xs text-neutral-500">
            <span>Checking subs</span>
            <span>{formatCurrency(summary.checkingSubscriptions)}</span>
          </div>
        </div>
      </div>

      <div className="mt-6 pt-4 border-t border-neutral-200 dark:border-neutral-600">
        <div className="flex justify-between items-baseline gap-2">
          <span className="text-base font-medium text-neutral-700 dark:text-neutral-300">Left over</span>
          <span className="text-xl font-bold text-emerald-600 dark:text-emerald-400">
            {formatCurrency(summary.leftOver)}
          </span>
        </div>
        <div className="flex justify-between items-baseline gap-2 mt-1">
          <span className="text-sm text-neutral-600 dark:text-neutral-400">Left over per paycheck</span>
          <span className="text-lg font-semibold text-emerald-600 dark:text-emerald-400">
            {formatCurrency(summary.leftOverPerPaycheck)}
          </span>
        </div>
        {summary.planToFamily && (
          <p className="mt-2 text-xs text-neutral-500 dark:text-neutral-400">
            Plan to family: {summary.planToFamily}
          </p>
        )}
      </div>
    </section>
  );
}
