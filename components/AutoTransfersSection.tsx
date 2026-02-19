"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { formatCurrency, displayAutoTransferWhatFor } from "@/lib/format";
import { getNextAutoTransferDate, formatDateNoYear } from "@/lib/paycheckDates";
import type { AutoTransfer } from "@/lib/types";
import { getCardClasses, getSectionLabelClasses } from "@/lib/themePalettes";
import { useTheme } from "./ThemeProvider";

const FREQ_BADGE_BASE = "inline-flex items-center justify-center w-6 h-6 rounded-md text-xs font-bold tabular-nums";

function frequencyBadge(freq: string) {
  const f = (freq ?? "").toLowerCase();
  const is2W = f.includes("2") && (f.includes("week") || f.includes("wk"));
  const letter = is2W ? "2W" : f.includes("month") ? "M" : f.includes("year") ? "Y" : freq ? freq.slice(0, 1).toUpperCase() : "?";
  const colorClass = is2W
    ? "bg-sky-200/90 text-sky-800 dark:bg-sky-800/70 dark:text-sky-200"
    : f.includes("month")
      ? "bg-amber-200/90 text-amber-800 dark:bg-amber-800/70 dark:text-amber-200"
      : f.includes("year")
        ? "bg-emerald-200/90 text-emerald-800 dark:bg-emerald-800/70 dark:text-emerald-200"
        : "bg-neutral-200/90 text-neutral-700 dark:bg-neutral-600/90 dark:text-neutral-200";
  const title = freq || (is2W ? "Every 2 weeks" : "Monthly");
  return <span className={`${FREQ_BADGE_BASE} ${colorClass}`} title={title}>{letter}</span>;
}

interface AutoTransfersSectionProps {
  transfers: AutoTransfer[];
  title?: string;
  subtitle?: string;
}

const FREQUENCY_OPTIONS = [
  { value: "2 Weeks", label: "2 Weeks" },
  { value: "Monthly", label: "Monthly" },
  { value: "Yearly", label: "Yearly" },
];

const ACCOUNT_OPTIONS = [
  { value: "Bills", label: "Bills" },
  { value: "Spanish Fork", label: "Spanish Fork" },
  { value: "Checking", label: "Checking" },
];

export function AutoTransfersSection({ transfers, title = "Auto transfers", subtitle = "What for, frequency, account, date, amount" }: AutoTransfersSectionProps) {
  const { theme } = useTheme();
  const router = useRouter();
  const [addOpen, setAddOpen] = useState(false);
  const [whatFor, setWhatFor] = useState("");
  const [frequency, setFrequency] = useState("Monthly");
  const [account, setAccount] = useState("Bills");
  const [date, setDate] = useState("");
  const [amount, setAmount] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (addOpen) {
      setWhatFor("");
      setFrequency("Monthly");
      setAccount("Bills");
      setDate("");
      setAmount("");
      setError("");
    }
  }, [addOpen]);

  useEffect(() => {
    if (!addOpen) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, [addOpen]);

  async function handleAddSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setSaving(true);
    try {
      const res = await fetch("/api/auto-transfers", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          whatFor: whatFor.trim(),
          frequency: frequency.trim(),
          account: account.trim(),
          date: date.trim(),
          amount: amount === "" ? 0 : Number(amount),
        }),
      });
      const data = (await res.json()) as { ok?: boolean; message?: string };
      if (!res.ok || data.ok === false) {
        setError(data.message ?? "Failed to add auto transfer.");
        return;
      }
      setAddOpen(false);
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to add.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <section className={getCardClasses(theme.autoTransfers)}>
      <div className="flex items-start justify-between gap-2">
        <div>
          <h2 className={getSectionLabelClasses(theme.autoTransfers)}>
            {title}
          </h2>
          <p className="text-xs text-neutral-500 dark:text-neutral-400 mt-0.5">
            {subtitle}
          </p>
        </div>
        <button
          type="button"
          onClick={() => setAddOpen(true)}
          className="shrink-0 inline-flex h-9 w-9 items-center justify-center rounded-full border border-neutral-200 bg-white/80 text-neutral-700 shadow-sm hover:bg-neutral-100 dark:border-neutral-700 dark:bg-neutral-900/80 dark:text-neutral-200 dark:hover:bg-neutral-800"
          aria-label="Add auto transfer"
        >
          <span className="sr-only">Add auto transfer</span>
          <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" />
          </svg>
        </button>
      </div>
      <div className="mt-3 overflow-x-auto -mx-4 px-4">
        <table className="w-full min-w-0 text-sm">
          <thead>
            <tr className="border-b border-neutral-200 dark:border-neutral-600 text-left text-xs text-neutral-500 dark:text-neutral-400">
              <th className="py-2 pr-2 font-medium">What for</th>
              <th className="py-2 pr-2 font-medium w-10 text-center">Freq</th>
              <th className="py-2 pr-2 font-medium">Account</th>
              <th className="py-2 pr-2 font-medium w-20">Date</th>
              <th className="py-2 font-medium text-right">Amount</th>
            </tr>
          </thead>
          <tbody>
            {transfers.map((t) => (
              <tr
                key={t.id}
                className="border-b border-neutral-100 dark:border-neutral-700/50 last:border-0"
              >
                <td className="py-2.5 pr-2 font-medium text-neutral-800 dark:text-neutral-200">{displayAutoTransferWhatFor(t.whatFor)}</td>
                <td className="py-2.5 pr-2 text-center">{frequencyBadge(t.frequency)}</td>
                <td className="py-2.5 pr-2 text-neutral-600 dark:text-neutral-400">{t.account}</td>
                <td className="py-2.5 pr-2 text-neutral-600 dark:text-neutral-400 whitespace-nowrap">
                  {t.date && t.frequency
                    ? (() => {
                        const next = getNextAutoTransferDate(t.date, t.frequency);
                        return Number.isNaN(next.getTime()) ? t.date : formatDateNoYear(next);
                      })()
                    : t.date || "—"}
                </td>
                <td className="py-2.5 text-right font-semibold tabular-nums">{formatCurrency(t.amount)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {addOpen && typeof document !== "undefined" && (
        <div
          className="fixed inset-0 z-[100] flex min-h-[100dvh] items-center justify-center bg-neutral-950/70 p-4 backdrop-blur-sm"
          onClick={() => !saving && setAddOpen(false)}
          role="dialog"
          aria-modal="true"
          aria-labelledby="add-auto-transfer-title"
        >
          <div
            className="w-full max-w-md rounded-2xl border border-neutral-200 dark:border-neutral-700 bg-white dark:bg-neutral-900 shadow-2xl overflow-hidden"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex shrink-0 items-center justify-between border-b border-neutral-200 dark:border-neutral-700 px-4 py-3">
              <h3 id="add-auto-transfer-title" className="text-sm font-semibold text-neutral-900 dark:text-neutral-100">
                Add auto transfer
              </h3>
              <button
                type="button"
                onClick={() => !saving && setAddOpen(false)}
                className="rounded-lg p-1.5 text-neutral-500 hover:text-neutral-700 dark:hover:text-neutral-300 hover:bg-neutral-100 dark:hover:bg-neutral-800"
                aria-label="Close"
              >
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
            <form onSubmit={handleAddSubmit} className="p-4 space-y-3">
              {error && (
                <p className="text-sm text-red-600 dark:text-red-400">{error}</p>
              )}
              <div>
                <label htmlFor="add-whatfor" className="block text-xs font-medium text-neutral-600 dark:text-neutral-400 mb-1">
                  What for
                </label>
                <input
                  id="add-whatfor"
                  type="text"
                  value={whatFor}
                  onChange={(e) => setWhatFor(e.target.value)}
                  placeholder="e.g. Bills covering"
                  className="w-full rounded-lg border border-neutral-300 dark:border-neutral-600 bg-white dark:bg-neutral-800 px-3 py-2 text-sm text-neutral-900 dark:text-neutral-100"
                  required
                />
              </div>
              <div>
                <label htmlFor="add-frequency" className="block text-xs font-medium text-neutral-600 dark:text-neutral-400 mb-1">
                  Frequency
                </label>
                <select
                  id="add-frequency"
                  value={frequency}
                  onChange={(e) => setFrequency(e.target.value)}
                  className="w-full rounded-lg border border-neutral-300 dark:border-neutral-600 bg-white dark:bg-neutral-800 px-3 py-2 text-sm text-neutral-900 dark:text-neutral-100"
                >
                  {FREQUENCY_OPTIONS.map((o) => (
                    <option key={o.value} value={o.value}>{o.label}</option>
                  ))}
                </select>
              </div>
              <div>
                <label htmlFor="add-account" className="block text-xs font-medium text-neutral-600 dark:text-neutral-400 mb-1">
                  Account
                </label>
                <select
                  id="add-account"
                  value={account}
                  onChange={(e) => setAccount(e.target.value)}
                  className="w-full rounded-lg border border-neutral-300 dark:border-neutral-600 bg-white dark:bg-neutral-800 px-3 py-2 text-sm text-neutral-900 dark:text-neutral-100"
                >
                  {ACCOUNT_OPTIONS.map((o) => (
                    <option key={o.value} value={o.value}>{o.label}</option>
                  ))}
                </select>
              </div>
              <div>
                <label htmlFor="add-date" className="block text-xs font-medium text-neutral-600 dark:text-neutral-400 mb-1">
                  Date (e.g. 2/15/2026 or YYYY-MM-DD)
                </label>
                <input
                  id="add-date"
                  type="text"
                  value={date}
                  onChange={(e) => setDate(e.target.value)}
                  placeholder="2/15/2026"
                  className="w-full rounded-lg border border-neutral-300 dark:border-neutral-600 bg-white dark:bg-neutral-800 px-3 py-2 text-sm text-neutral-900 dark:text-neutral-100"
                />
              </div>
              <div>
                <label htmlFor="add-amount" className="block text-xs font-medium text-neutral-600 dark:text-neutral-400 mb-1">
                  Amount
                </label>
                <input
                  id="add-amount"
                  type="number"
                  inputMode="decimal"
                  min={0}
                  step="any"
                  value={amount}
                  onChange={(e) => setAmount(e.target.value)}
                  placeholder="0"
                  className="w-full rounded-lg border border-neutral-300 dark:border-neutral-600 bg-white dark:bg-neutral-800 px-3 py-2 text-sm text-neutral-900 dark:text-neutral-100"
                />
              </div>
              <div className="flex gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => !saving && setAddOpen(false)}
                  className="flex-1 rounded-lg border border-neutral-300 dark:border-neutral-600 px-3 py-2 text-sm font-medium text-neutral-700 dark:text-neutral-300 hover:bg-neutral-100 dark:hover:bg-neutral-800"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={saving || !whatFor.trim()}
                  className="flex-1 rounded-lg bg-sky-600 text-white px-3 py-2 text-sm font-medium hover:bg-sky-500 disabled:opacity-50"
                >
                  {saving ? "Adding…" : "Add"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </section>
  );
}
