import { formatCurrency } from "@/lib/format";
import type { AutoTransfer } from "@/lib/types";

interface AutoTransfersSectionProps {
  transfers: AutoTransfer[];
  title?: string;
  subtitle?: string;
}

export function AutoTransfersSection({ transfers, title = "Auto transfers", subtitle = "What for, frequency, account, date, amount" }: AutoTransfersSectionProps) {
  return (
    <section className="rounded-xl border border-neutral-200 dark:border-neutral-700 bg-white dark:bg-neutral-800/50 p-4 shadow-sm">
      <h2 className="text-base font-semibold text-neutral-800 dark:text-neutral-200">
        {title}
      </h2>
      <p className="text-xs text-neutral-500 dark:text-neutral-400 mt-0.5">
        {subtitle}
      </p>
      <ul className="mt-3 space-y-3">
        {transfers.map((t) => (
          <li
            key={t.id}
            className="flex flex-wrap items-baseline gap-x-2 gap-y-1 py-2 border-b border-neutral-100 dark:border-neutral-700/50 last:border-0 text-sm"
          >
            <span className="font-medium text-neutral-800 dark:text-neutral-200">{t.whatFor}</span>
            <span className="text-neutral-500 dark:text-neutral-400">{t.frequency}</span>
            <span className="text-neutral-500 dark:text-neutral-400">→ {t.account}</span>
            <span className="text-neutral-500 dark:text-neutral-400 text-xs">{t.date}</span>
            <span className="ml-auto font-semibold tabular-nums">{formatCurrency(t.amount)}</span>
          </li>
        ))}
      </ul>
    </section>
  );
}
