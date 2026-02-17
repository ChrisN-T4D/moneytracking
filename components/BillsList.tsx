 "use client";

import { formatCurrency } from "@/lib/format";
import type { BillOrSub } from "@/lib/types";
import { getCardClasses } from "@/lib/themePalettes";
import { useTheme } from "./ThemeProvider";

interface BillsListProps {
  title: string;
  subtitle?: string;
  items: BillOrSub[];
}

function frequencyLabel(f: BillOrSub["frequency"]) {
  switch (f) {
    case "2weeks":
      return "2 wks";
    case "monthly":
      return "Monthly";
    case "yearly":
      return "Yearly";
    default:
      return f;
  }
}

export function BillsList({ title, subtitle, items }: BillsListProps) {
  const { theme } = useTheme();

  return (
    <section className={getCardClasses(theme.bills)}>
      <h2 className="text-base font-semibold text-neutral-900 dark:text-neutral-100">{title}</h2>
      {subtitle && (
        <p className="text-xs text-neutral-500 dark:text-neutral-400 mt-0.5">{subtitle}</p>
      )}
      <div className="mt-3 overflow-x-auto -mx-4 px-4">
        <table className="w-full min-w-[320px] text-sm">
          <thead>
            <tr className="border-b border-neutral-200 dark:border-neutral-600 text-left text-xs text-neutral-500 dark:text-neutral-400">
              <th className="py-2 pr-2 font-medium">Name</th>
              <th className="py-2 pr-2 font-medium w-16">Freq</th>
              <th className="py-2 pr-2 font-medium w-20">Next due</th>
              <th className="py-2 pr-2 font-medium w-12 text-center">This pay?</th>
              <th className="py-2 font-medium text-right">Amount</th>
            </tr>
          </thead>
          <tbody>
            {items.map((item) => (
              <tr
                key={item.id}
                className="border-b border-neutral-100 dark:border-neutral-700/50 last:border-0"
              >
                <td className="py-2.5 pr-2 text-neutral-800 dark:text-neutral-200">{item.name}</td>
                <td className="py-2.5 pr-2 text-neutral-600 dark:text-neutral-400">
                  {frequencyLabel(item.frequency)}
                </td>
                <td className="py-2.5 pr-2 text-neutral-600 dark:text-neutral-400 whitespace-nowrap">
                  {item.nextDue}
                </td>
                <td className="py-2.5 pr-2 text-center">
                  {item.inThisPaycheck ? (
                    <span className="inline-flex items-center justify-center w-6 h-6 rounded-full bg-emerald-100 dark:bg-emerald-900/40 text-emerald-600 dark:text-emerald-400 text-xs font-medium">
                      ✓
                    </span>
                  ) : (
                    <span className="text-neutral-300 dark:text-neutral-500">—</span>
                  )}
                </td>
                <td className="py-2.5 text-right font-medium tabular-nums">
                  {formatCurrency(item.amount)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}
