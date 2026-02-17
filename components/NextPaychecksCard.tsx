"use client";

import { formatCurrency } from "@/lib/format";
import { formatDateShort, daysUntil } from "@/lib/paycheckDates";
import type { NextPaycheckInfo } from "@/lib/paycheckConfig";
import { getCardClasses, getSectionLabelClasses } from "@/lib/themePalettes";
import { useTheme } from "./ThemeProvider";

interface NextPaychecksCardProps {
  today: Date;
  paychecks: NextPaycheckInfo[];
}

export function NextPaychecksCard({ today, paychecks }: NextPaychecksCardProps) {
  const { theme } = useTheme();

  return (
    <section className={getCardClasses(theme.paychecks)}>
      <h2 className={getSectionLabelClasses(theme.paychecks)}>
        Next paychecks
      </h2>
      <div className="flex items-center gap-2 text-sm text-neutral-600 dark:text-neutral-400 mb-4">
        <span>Today:</span>
        <span className="font-medium text-neutral-800 dark:text-neutral-200">
          {formatDateShort(today)}
        </span>
      </div>
      <ul className="space-y-3">
        {paychecks.map((p) => {
          const days = daysUntil(today, p.nextDate);
          const isToday = days === 0;
          const isPast = days < 0;
          return (
            <li
              key={p.name}
              className="flex flex-wrap items-baseline justify-between gap-x-2 gap-y-1 py-2 border-b border-neutral-100 dark:border-neutral-700/50 last:border-0"
            >
              <div>
                <span className="font-medium text-neutral-800 dark:text-neutral-200">
                  {p.name}
                </span>
                <span className="ml-2 text-xs text-neutral-500 dark:text-neutral-400">
                  {p.frequency === "biweekly"
                    ? "every other Thu"
                    : p.frequency === "monthlyLastWorkingDay"
                      ? "last working day"
                      : "monthly"}
                </span>
              </div>
              <div className="flex items-baseline gap-2">
                <span
                  className={
                    isToday
                      ? "text-amber-600 dark:text-amber-400 font-semibold"
                      : isPast
                        ? "text-neutral-400 dark:text-neutral-500"
                        : "text-neutral-700 dark:text-neutral-300"
                  }
                >
                  {formatDateShort(p.nextDate)}
                </span>
                {!isPast && (
                  <span className="text-xs text-neutral-500 dark:text-neutral-400">
                    {days === 0 ? "today" : days === 1 ? "1 day" : `${days} days`}
                  </span>
                )}
                {p.amount != null && p.amount > 0 && (
                  <span className="text-sm font-medium tabular-nums">
                    {formatCurrency(p.amount)}
                  </span>
                )}
              </div>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
