"use client";

import { useState, useRef, useCallback } from "react";
import { formatCurrency, displayBillName } from "@/lib/format";
import { formatDateStringNoYear } from "@/lib/paycheckDates";
import type { BillOrSub } from "@/lib/types";
import { getCardClasses } from "@/lib/themePalettes";
import { useTheme } from "./ThemeProvider";

interface BillsListProps {
  title: string;
  subtitle?: string;
  items: BillOrSub[];
  /** Total paid this month for the whole section (shown in header). */
  monthlySpending?: number;
  /** Sum of budgeted amounts; when set, shown next to paid total for comparison. */
  budgetedTotal?: number;
  /** Per-bill paid amounts this month, keyed by bill name (case-insensitive lookup). */
  paidByName?: Record<string, number>;
}

const FREQ_BADGE_BASE = "inline-flex items-center justify-center w-6 h-6 rounded-md text-xs font-bold tabular-nums";

function frequencyBadge(f: BillOrSub["frequency"]) {
  const letter = f === "2weeks" ? "2W" : f === "monthly" ? "M" : f === "yearly" ? "Y" : "?";
  const colorClass =
    f === "2weeks"
      ? "bg-sky-200/90 text-sky-800 dark:bg-sky-800/70 dark:text-sky-200"
      : f === "monthly"
        ? "bg-amber-200/90 text-amber-800 dark:bg-amber-800/70 dark:text-amber-200"
        : f === "yearly"
          ? "bg-emerald-200/90 text-emerald-800 dark:bg-emerald-800/70 dark:text-emerald-200"
          : "bg-neutral-200/90 text-neutral-700 dark:bg-neutral-600/90 dark:text-neutral-200";
  return <span className={`${FREQ_BADGE_BASE} ${colorClass}`} title={f === "2weeks" ? "Every 2 weeks" : f === "monthly" ? "Monthly" : f === "yearly" ? "Yearly" : f}>{letter}</span>;
}

interface EditState {
  id: string;
  value: string;
  saving: boolean;
  error: string | null;
}

export function BillsList({ title, subtitle, items: initialItems, monthlySpending, budgetedTotal, paidByName = {} }: BillsListProps) {
  const { theme } = useTheme();
  const [items, setItems] = useState<BillOrSub[]>(initialItems);
  const [edit, setEdit] = useState<EditState | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const budget = budgetedTotal ?? items.reduce((sum, i) => sum + (i.amount ?? 0), 0);
  const paid = monthlySpending ?? 0;
  const hasBudget = budget > 0;

  // Case-insensitive lookup; also try display name (without " (Bills Acct)" etc.)
  const getPaidForItem = (name: string): number | undefined => {
    const exact = paidByName[name];
    if (exact !== undefined) return exact;
    const lower = name.toLowerCase();
    for (const [k, v] of Object.entries(paidByName)) {
      if (k.toLowerCase() === lower) return v;
    }
    const display = displayBillName(name);
    if (display !== name) {
      const displayExact = paidByName[display];
      if (displayExact !== undefined) return displayExact;
      const displayLower = display.toLowerCase();
      for (const [k, v] of Object.entries(paidByName)) {
        if (k.toLowerCase() === displayLower) return v;
      }
    }
    return undefined;
  };

  const startEdit = useCallback((item: BillOrSub) => {
    setEdit({ id: item.id, value: String(item.amount ?? ""), saving: false, error: null });
    setTimeout(() => inputRef.current?.select(), 0);
  }, []);

  const cancelEdit = useCallback(() => setEdit(null), []);

  const commitEdit = useCallback(async (item: BillOrSub) => {
    if (!edit || edit.saving) return;
    const raw = edit.value.replace(/[$,\s]/g, "");
    const amount = parseFloat(raw);
    if (Number.isNaN(amount) || amount < 0) {
      setEdit((e) => e ? { ...e, error: "Enter a valid amount" } : null);
      return;
    }
    if (amount === item.amount) { setEdit(null); return; }

    setEdit((e) => e ? { ...e, saving: true, error: null } : null);
    setItems((prev) => prev.map((b) => b.id === item.id ? { ...b, amount } : b));

    try {
      const res = await fetch(`/api/bills/${item.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ amount }),
      });
      if (!res.ok) {
        const data = (await res.json().catch(() => ({}))) as { message?: string };
        setItems((prev) => prev.map((b) => b.id === item.id ? { ...b, amount: item.amount } : b));
        setEdit((e) => e ? { ...e, saving: false, error: data.message ?? "Save failed" } : null);
        return;
      }
      setEdit(null);
    } catch {
      setItems((prev) => prev.map((b) => b.id === item.id ? { ...b, amount: item.amount } : b));
      setEdit((e) => e ? { ...e, saving: false, error: "Save failed" } : null);
    }
  }, [edit]);

  return (
    <section className={getCardClasses(theme.bills)}>
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <div>
          <h2 className="text-base font-semibold text-neutral-900 dark:text-neutral-100">{title}</h2>
          {subtitle && (
            <p className="text-xs text-neutral-500 dark:text-neutral-400 mt-0.5">{subtitle}</p>
          )}
        </div>
        {hasBudget && (
          <div className="text-right">
            <p className="text-xs text-neutral-500 dark:text-neutral-400">
              Budget {formatCurrency(budget)}
              {paid > 0 && (
                <>
                  {" · "}
                  <span className={paid > budget ? "text-amber-600 dark:text-amber-400" : "text-emerald-600 dark:text-emerald-400"}>
                    {paid > budget ? "over" : "under"} by {formatCurrency(Math.abs(paid - budget))}
                  </span>
                </>
              )}
            </p>
          </div>
        )}
      </div>

      <div className="mt-3 overflow-x-auto -mx-4 px-4">
        <table className="w-full min-w-0 text-sm">
          <thead>
            <tr className="border-b border-neutral-200 dark:border-neutral-600 text-left text-xs text-neutral-500 dark:text-neutral-400">
              <th className="py-2 pr-2 font-medium">Name</th>
              <th className="py-2 pr-2 font-medium w-10 text-center">Freq</th>
              <th className="py-2 pr-2 font-medium w-20">Next due</th>
              <th className="py-2 pr-2 font-medium w-12 text-center">This paycheck?</th>
              <th className="py-2 pr-2 font-medium text-right">Amount</th>
              <th className="py-2 font-medium text-right">Paid this month</th>
            </tr>
          </thead>
          <tbody>
            {items.map((item) => {
              const isEditing = edit?.id === item.id;
              const paidAmt = getPaidForItem(item.name);
              return (
                <tr
                  key={item.id}
                  className="border-b border-neutral-100 dark:border-neutral-700/50 last:border-0"
                >
                  <td className="py-2.5 pr-2 text-neutral-800 dark:text-neutral-200">{displayBillName(item.name)}</td>
                  <td className="py-2.5 pr-2 text-neutral-600 dark:text-neutral-400 text-center">
                    {frequencyBadge(item.frequency)}
                  </td>
                  <td className="py-2.5 pr-2 text-neutral-600 dark:text-neutral-400 whitespace-nowrap">
                    {formatDateStringNoYear(item.nextDue)}
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
                  <td className="py-2.5 pr-2 text-right font-medium tabular-nums">
                    {isEditing ? (
                      <div className="flex flex-col items-end gap-1">
                        <div className="flex items-center gap-1">
                          <span className="text-neutral-400 text-xs">$</span>
                          <input
                            ref={inputRef}
                            type="number"
                            inputMode="decimal"
                            min="0"
                            step="0.01"
                            value={edit.value}
                            disabled={edit.saving}
                            onChange={(e) => setEdit((s) => s ? { ...s, value: e.target.value, error: null } : null)}
                            onKeyDown={(e) => {
                              if (e.key === "Enter") { e.preventDefault(); void commitEdit(item); }
                              if (e.key === "Escape") cancelEdit();
                            }}
                            onBlur={() => void commitEdit(item)}
                            className="w-24 rounded border border-blue-400 bg-white dark:bg-neutral-800 px-1.5 py-0.5 text-right text-sm font-medium focus:outline-none focus:ring-2 focus:ring-blue-400 tabular-nums disabled:opacity-50"
                            autoFocus
                          />
                        </div>
                        {edit.error && <p className="text-xs text-red-500">{edit.error}</p>}
                        {edit.saving && <p className="text-xs text-neutral-400">Saving…</p>}
                      </div>
                    ) : (
                      <button
                        type="button"
                        onClick={() => startEdit(item)}
                        title="Click to edit amount"
                        className="group relative tabular-nums hover:text-blue-600 dark:hover:text-blue-400 transition-colors"
                      >
                        {formatCurrency(item.amount)}
                        <span className="absolute -right-4 top-1/2 -translate-y-1/2 opacity-0 group-hover:opacity-100 transition-opacity text-blue-400">
                          <svg className="w-3 h-3" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
                            <path d="M11.5 2.5a1.5 1.5 0 0 1 2 2L5 13l-3 1 1-3 8.5-8.5z"/>
                          </svg>
                        </span>
                      </button>
                    )}
                  </td>
                  <td className="py-2.5 text-right tabular-nums">
                    {paidAmt !== undefined ? (
                      <span className={paidAmt > (item.amount ?? 0) ? "text-amber-600 dark:text-amber-400 font-medium" : "text-emerald-600 dark:text-emerald-400 font-medium"}>
                        {formatCurrency(paidAmt)}
                      </span>
                    ) : (
                      <span className="text-neutral-300 dark:text-neutral-600">—</span>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </section>
  );
}
