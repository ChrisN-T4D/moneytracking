"use client";

import { useState } from "react";
import { createPortal } from "react-dom";
import { formatCurrency } from "@/lib/format";
import { formatDateNoYear } from "@/lib/paycheckDates";
import type { MoneyStatus } from "@/lib/summaryCalculations";
import { getCardClasses, getSectionLabelClasses } from "@/lib/themePalettes";
import { useTheme } from "./ThemeProvider";
import { useGoals } from "./GoalsContext";

interface SummaryCardProps {
  moneyStatus: MoneyStatus;
}

type AccountKey = "checking" | "bills" | "spanishFork";

const ACCOUNT_LABELS: Record<AccountKey, string> = {
  checking: "Checking",
  bills: "Bills acct",
  spanishFork: "Spanish Fork",
};

export function SummaryCard({ moneyStatus }: SummaryCardProps) {
  const { theme } = useTheme();
  const { forMonthName, paychecksThisMonth, payDates, predictedNeed, autoTransfersIn, accountBalances, paidThisMonth, leftOverComputed, variableExpensesThisMonth = 0, variableExpensesBreakdown = [] } = moneyStatus;
  // Use context so goal contribution changes reflect instantly (no server round-trip needed)
  const { totalMonthlyContributions: totalGoalContributions } = useGoals();

  const [variableExpensesModalOpen, setVariableExpensesModalOpen] = useState(false);
  const [balances, setBalances] = useState<Record<AccountKey, number | null>>({
    checking: accountBalances.checking,
    bills: accountBalances.bills,
    spanishFork: accountBalances.spanishFork,
  });
  const [editing, setEditing] = useState<AccountKey | null>(null);
  const [editValue, setEditValue] = useState("");
  const [saving, setSaving] = useState(false);

  function startEdit(key: AccountKey) {
    setEditing(key);
    setEditValue(balances[key] != null ? String(balances[key]) : "");
  }

  async function commitEdit(key: AccountKey) {
    const num = editValue.trim() === "" ? null : Number(editValue);
    setEditing(null);
    if (num === balances[key]) return;
    const prev = balances[key];
    setBalances((b) => ({ ...b, [key]: num }));
    setSaving(true);
    try {
      const res = await fetch("/api/summary", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          checkingBalance: key === "checking" ? num : undefined,
          billsBalance: key === "bills" ? num : undefined,
          spanishForkBalance: key === "spanishFork" ? num : undefined,
        }),
      });
      if (!res.ok) {
        setBalances((b) => ({ ...b, [key]: prev }));
      }
    } catch {
      setBalances((b) => ({ ...b, [key]: prev }));
    } finally {
      setSaving(false);
    }
  }

  const predictedByKey: Record<AccountKey, number> = {
    checking: predictedNeed.checkingAccount,
    bills: predictedNeed.billsAccount,
    spanishFork: predictedNeed.spanishFork,
  };

  const paidByKey: Record<AccountKey, number> = {
    checking: paidThisMonth.checking,
    bills: paidThisMonth.bills,
    spanishFork: paidThisMonth.spanishFork,
  };

  const computedCurrentByKey: Record<AccountKey, number> = {
    checking: paychecksThisMonth - autoTransfersIn.outFromChecking,
    bills: autoTransfersIn.bills,
    spanishFork: autoTransfersIn.spanishFork,
  };

  const accountKeys: AccountKey[] = ["checking", "bills", "spanishFork"];

  return (
    <section className={getCardClasses(theme.summary)}>
      <h2 className={getSectionLabelClasses(theme.summary)}>
        Current money status
      </h2>

      {/* Expected paychecks */}
      <div className="mt-2 rounded-lg bg-neutral-100/80 dark:bg-neutral-800/50 px-3 py-2 text-sm">
        <div className="flex justify-between items-baseline">
          <span className="text-neutral-600 dark:text-neutral-400">
            Expected paychecks{forMonthName ? ` for ${forMonthName}` : " (next month)"}
          </span>
          <span className="font-semibold text-neutral-900 dark:text-neutral-100">{formatCurrency(paychecksThisMonth)}</span>
        </div>
        <p className="text-xs text-neutral-500 dark:text-neutral-400 mt-0.5">→ deposited into Checking, then auto-transferred out</p>
        {payDates.length > 0 && (
          <ul className="mt-1.5 space-y-0.5">
            {payDates.map((p, i) => (
              <li key={i} className="flex justify-between text-xs text-neutral-500 dark:text-neutral-400">
                <span>{formatDateNoYear(p.date)}{p.name ? ` · ${p.name}` : ""}</span>
                <span className="tabular-nums">{formatCurrency(p.amount)}</span>
              </li>
            ))}
          </ul>
        )}
      </div>

      {/* Per-account table */}
      <div className="mt-4 border-t border-neutral-200 dark:border-neutral-600 pt-4">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-xs text-neutral-500 dark:text-neutral-400 border-b border-neutral-200 dark:border-neutral-600">
              <th className="text-left font-medium pb-1.5">Account</th>
              <th className="text-right font-medium pb-1.5">Needed this month</th>
              <th className="text-right font-medium pb-1.5 pl-3">Current</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-neutral-100 dark:divide-neutral-700/50">
            {accountKeys.map((key) => {
              const needed = predictedByKey[key];
              const paid = paidByKey[key];
              const remaining = Math.max(0, needed - paid);
              const stored = balances[key];
              const computed = computedCurrentByKey[key];
              const current = stored ?? computed;
              const diff = current - remaining;
              const diffColor = diff >= 0
                ? "text-emerald-600 dark:text-emerald-400"
                : "text-red-600 dark:text-red-400";
              const isEditing = editing === key;

              return (
                <tr key={key}>
                  <td className="py-2 font-medium text-neutral-700 dark:text-neutral-300">{ACCOUNT_LABELS[key]}</td>
                  <td className="py-2 text-right tabular-nums text-neutral-600 dark:text-neutral-400">
                    {formatCurrency(needed)}
                    {paid > 0 && (
                      <span className="block text-[10px] text-neutral-400">paid {formatCurrency(paid)}</span>
                    )}
                  </td>
                  <td className="py-2 pl-3 text-right">
                    {isEditing ? (
                      <input
                        autoFocus
                        type="number"
                        inputMode="decimal"
                        value={editValue}
                        onChange={(e) => setEditValue(e.target.value)}
                        onBlur={() => void commitEdit(key)}
                        onKeyDown={(e) => {
                          if (e.key === "Enter") void commitEdit(key);
                          if (e.key === "Escape") setEditing(null);
                        }}
                        className="w-24 rounded border border-sky-400 bg-white dark:bg-neutral-900 px-1.5 py-0.5 text-right text-sm tabular-nums text-neutral-900 dark:text-neutral-100 outline-none"
                      />
                    ) : (
                      <button
                        type="button"
                        onClick={() => startEdit(key)}
                        title="Tap to enter actual balance"
                        className={`tabular-nums font-medium ${diffColor} underline-offset-2 hover:underline cursor-text`}
                      >
                        {formatCurrency(current)}
                        {stored == null && <span className="ml-1 text-[10px] text-neutral-400 no-underline">(est)</span>}
                      </button>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
        {saving && <p className="text-xs text-neutral-400 mt-1 text-right">Saving…</p>}
        <p className="text-[11px] text-neutral-400 dark:text-neutral-500 mt-1.5">
          Tap a current balance to enter actual amount. "(est)" means computed from auto transfers.
        </p>
      </div>

      {/* Groceries & Gas subsection (combined) */}
      {moneyStatus.subsections && (
        <div className="mt-4 border-t border-neutral-200 dark:border-neutral-600 pt-4">
          <p className="text-xs font-medium text-neutral-500 dark:text-neutral-400 mb-2">Subsections (checking)</p>
          <table className="w-full text-sm">
            <thead>
              <tr className="text-xs text-neutral-500 dark:text-neutral-400 border-b border-neutral-200 dark:border-neutral-600">
                <th className="text-left font-medium pb-1.5">Subsection</th>
                <th className="text-right font-medium pb-1.5">Remaining</th>
                <th className="text-right font-medium pb-1.5 pl-3">Spent</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-neutral-100 dark:divide-neutral-700/50">
              <tr>
                <td className="py-2 font-medium text-neutral-700 dark:text-neutral-300">Groceries & Gas (this paycheck)</td>
                <td className="py-2 text-right tabular-nums text-neutral-600 dark:text-neutral-400">
                  {formatCurrency(Math.max(0, moneyStatus.subsections.groceriesAndGas.budget - moneyStatus.subsections.groceriesAndGas.spent))}
                  {moneyStatus.subsections.groceriesAndGas.budget > 0 && (
                    <span className="block text-[10px] text-neutral-400">of {formatCurrency(moneyStatus.subsections.groceriesAndGas.budget)}</span>
                  )}
                </td>
                <td className="py-2 pl-3 text-right tabular-nums text-neutral-600 dark:text-neutral-400">
                  {formatCurrency(moneyStatus.subsections.groceriesAndGas.spent)}
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      )}

      {/* Goal contributions */}
      {totalGoalContributions > 0 && (
        <div className="mt-3 flex justify-between text-sm text-neutral-600 dark:text-neutral-400 border-t border-neutral-200 dark:border-neutral-600 pt-3">
          <span>Monthly goal contributions</span>
          <span className="tabular-nums text-amber-600 dark:text-amber-400">− {formatCurrency(totalGoalContributions)}</span>
        </div>
      )}

      {/* Variable expenses (tagged in Add items to bills) — subtracts from left over; click to see breakdown */}
      {variableExpensesThisMonth > 0 && (
        <div className="mt-3 border-t border-neutral-200 dark:border-neutral-600 pt-3">
          <button
            type="button"
            onClick={() => variableExpensesBreakdown.length > 0 && setVariableExpensesModalOpen(true)}
            disabled={variableExpensesBreakdown.length === 0}
            className="w-full flex justify-between text-sm text-neutral-600 dark:text-neutral-400 hover:text-neutral-800 dark:hover:text-neutral-200 disabled:pointer-events-none disabled:opacity-100"
            title={variableExpensesBreakdown.length > 0 ? "View items assigned to variable expenses" : undefined}
          >
            <span>Variable expenses</span>
            <span className="tabular-nums text-neutral-700 dark:text-neutral-300">− {formatCurrency(variableExpensesThisMonth)}</span>
          </button>
        </div>
      )}

      {variableExpensesModalOpen &&
        typeof document !== "undefined" &&
        createPortal(
          <div
            className="fixed inset-0 z-[100] flex min-h-[100dvh] items-center justify-center bg-neutral-950/70 p-4 backdrop-blur-sm"
            onClick={() => setVariableExpensesModalOpen(false)}
            role="dialog"
            aria-modal="true"
            aria-labelledby="variable-expenses-modal-title"
          >
            <div
              className="bg-white dark:bg-neutral-900 rounded-2xl shadow-2xl max-w-lg w-full max-h-[85vh] flex flex-col border border-neutral-200 dark:border-neutral-700 overflow-hidden"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="shrink-0 flex items-center justify-between px-4 py-3 border-b border-neutral-200 dark:border-neutral-700">
                <h3 id="variable-expenses-modal-title" className="text-sm font-semibold text-neutral-900 dark:text-neutral-100">
                  Variable expenses
                </h3>
                <button
                  type="button"
                  onClick={() => setVariableExpensesModalOpen(false)}
                  className="rounded-lg p-1.5 text-neutral-500 hover:text-neutral-700 dark:hover:text-neutral-300 hover:bg-neutral-100 dark:hover:bg-neutral-800"
                  aria-label="Close"
                >
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 6L18 18M18 6L6 18" />
                  </svg>
                </button>
              </div>
              <div className="flex-1 min-h-0 overflow-y-auto p-4">
                {(() => {
                  const byMonth = new Map<string, { date: string; description: string; amount: number }[]>();
                  for (const t of variableExpensesBreakdown) {
                    const monthKey = t.date.slice(0, 7);
                    if (!byMonth.has(monthKey)) byMonth.set(monthKey, []);
                    byMonth.get(monthKey)!.push(t);
                  }
                  const months = [...byMonth.entries()].sort(([a], [b]) => b.localeCompare(a));
                  return (
                    <div className="space-y-4">
                      {months.map(([monthKey, transactions]) => {
                        const [y, m] = monthKey.split("-");
                        const monthName = new Date(Number(y), Number(m) - 1, 1).toLocaleString("en-US", { month: "long", year: "numeric" });
                        const total = transactions.reduce((sum, t) => sum + t.amount, 0);
                        return (
                          <div key={monthKey}>
                            <p className="text-xs font-medium text-neutral-500 dark:text-neutral-400 mb-2">
                              {monthName} — {formatCurrency(total)} ({transactions.length} transaction{transactions.length !== 1 ? "s" : ""})
                            </p>
                            <ul className="space-y-1.5">
                              {transactions
                                .sort((a, b) => a.date.localeCompare(b.date))
                                .map((t, i) => (
                                  <li
                                    key={`${t.date}-${t.description}-${i}`}
                                    className="flex justify-between gap-2 text-sm text-neutral-700 dark:text-neutral-300 border-b border-neutral-100 dark:border-neutral-800 pb-1.5 last:border-0"
                                  >
                                    <span className="min-w-0 truncate" title={t.description}>
                                      {t.date.slice(5)} {t.description}
                                    </span>
                                    <span className="tabular-nums shrink-0 font-medium">{formatCurrency(t.amount)}</span>
                                  </li>
                                ))}
                            </ul>
                          </div>
                        );
                      })}
                    </div>
                  );
                })()}
              </div>
            </div>
          </div>,
          document.body
        )}

      {/* Left over */}
      <div className="mt-4 pt-4 border-t border-neutral-200 dark:border-neutral-600">
        <div className="flex justify-between items-baseline gap-2">
          <span className="text-base font-medium text-neutral-700 dark:text-neutral-300">Left over</span>
          <span className="text-xl font-bold text-emerald-600 dark:text-emerald-400">
            {formatCurrency(leftOverComputed)}
          </span>
        </div>
      </div>
    </section>
  );
}
