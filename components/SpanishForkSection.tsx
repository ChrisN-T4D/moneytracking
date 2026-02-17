 "use client";

import { formatCurrency } from "@/lib/format";
import type { SpanishForkBill } from "@/lib/types";
import { getCardClasses } from "@/lib/themePalettes";
import { useTheme } from "./ThemeProvider";

interface SpanishForkSectionProps {
  bills: SpanishForkBill[];
  title?: string;
  subtitle?: string;
}

export function SpanishForkSection({ bills, title = "Spanish Fork (Rental)", subtitle = "Bills with tenant paid amounts" }: SpanishForkSectionProps) {
  const { theme } = useTheme();

  return (
    <section className={getCardClasses(theme.spanishFork)}>
      <h2 className="text-base font-semibold text-neutral-900 dark:text-neutral-100">
        {title}
      </h2>
      <p className="text-xs text-neutral-500 dark:text-neutral-400 mt-0.5">
        {subtitle}
      </p>
      <div className="mt-3 overflow-x-auto -mx-4 px-4">
        <table className="w-full min-w-[280px] text-sm">
          <thead>
            <tr className="border-b border-neutral-200 dark:border-neutral-600 text-left text-xs text-neutral-500 dark:text-neutral-400">
              <th className="py-2 pr-2 font-medium">Bill</th>
              <th className="py-2 pr-2 font-medium w-16">Freq</th>
              <th className="py-2 pr-2 font-medium w-20">Next due</th>
              <th className="py-2 pr-2 font-medium text-right">Amount</th>
              <th className="py-2 font-medium text-right">Tenant paid</th>
            </tr>
          </thead>
          <tbody>
            {bills.map((bill) => (
              <tr
                key={bill.id}
                className="border-b border-neutral-100 dark:border-neutral-700/50 last:border-0"
              >
                <td className="py-2.5 pr-2 text-neutral-800 dark:text-neutral-200">{bill.name}</td>
                <td className="py-2.5 pr-2 text-neutral-600 dark:text-neutral-400">{bill.frequency}</td>
                <td className="py-2.5 pr-2 text-neutral-600 dark:text-neutral-400 whitespace-nowrap">
                  {bill.nextDue}
                </td>
                <td className="py-2.5 pr-2 text-right font-medium tabular-nums">
                  {formatCurrency(bill.amount)}
                </td>
                <td className="py-2.5 text-right tabular-nums">
                  {bill.tenantPaid !== null ? formatCurrency(bill.tenantPaid) : "—"}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}
