"use client";

import { useState, useMemo } from "react";
import { useRouter } from "next/navigation";
import { formatCurrency } from "@/lib/format";
import { formatDateNoYear, formatDateShort, daysUntil, billingMonthNameForLastWorkingDay } from "@/lib/paycheckDates";
import { getNextPaychecks, type NextPaycheckInfo } from "@/lib/paycheckConfig";
import type { PaycheckConfig, PaycheckFrequency } from "@/lib/types";
import { getCardClasses, getSectionLabelClasses } from "@/lib/themePalettes";
import { useTheme } from "./ThemeProvider";

interface NextPaychecksCardProps {
  today: Date;
  paycheckPaidThisMonth?: number;
  canEdit?: boolean;
  paycheckConfigs?: PaycheckConfig[];
}

export function NextPaychecksCard({ today, paycheckPaidThisMonth, canEdit = true, paycheckConfigs }: NextPaychecksCardProps) {
  const { theme } = useTheme();
  const router = useRouter();
  // Initialised eagerly on the client so we always have the user's local "today".
  const [clientToday] = useState<Date | null>(() =>
    typeof window !== "undefined" ? new Date() : null
  );
  const [editing, setEditing] = useState<NextPaycheckInfo | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [markingReceived, setMarkingReceived] = useState<string | null>(null); // id of row being marked
  const [markError, setMarkError] = useState<Record<string, string>>({});

  async function markReceived(p: NextPaycheckInfo) {
    const today = new Date();
    const anchorDate = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, "0")}-${String(today.getDate()).padStart(2, "0")}`;
    setMarkingReceived(p.id);
    setMarkError((e) => { const n = { ...e }; delete n[p.id]; return n; });
    try {
      const res = await fetch(`/api/paychecks/${p.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ anchorDate }),
        credentials: "include",
      });
      const data = (await res.json()) as { ok?: boolean; message?: string };
      if (!res.ok) {
        setMarkError((e) => ({ ...e, [p.id]: data.message ?? "Save failed" }));
        return;
      }
      router.refresh();
    } catch {
      setMarkError((e) => ({ ...e, [p.id]: "Save failed" }));
    } finally {
      setMarkingReceived(null);
    }
  }

  const displayToday = clientToday ?? today;
  // Always derive next dates from configs on the client so dates never carry a UTC offset.
  const displayPaychecks = useMemo(
    () => getNextPaychecks(paycheckConfigs ?? [], displayToday),
    [paycheckConfigs, displayToday]
  );
  const showList = clientToday !== null;

  const handleSave = async (e: React.FormEvent<HTMLFormElement>) => {
    if (!editing) return;
    e.preventDefault();
    const form = e.currentTarget;
    const name = (form.elements.namedItem("name") as HTMLInputElement)?.value?.trim() ?? editing.name;
    const amountRaw = (form.elements.namedItem("amount") as HTMLInputElement)?.value?.trim();
    const amount = amountRaw === "" || amountRaw === undefined ? null : Number(amountRaw);
    const frequency = ((form.elements.namedItem("frequency") as HTMLSelectElement)?.value ?? editing.frequency) as PaycheckFrequency;
    const anchorDateRaw = (form.elements.namedItem("anchorDate") as HTMLInputElement)?.value?.trim();
    const anchorDate = anchorDateRaw || null;
    setSaving(true);
    setError(null);
    try {
      const res = await fetch(`/api/paychecks/${editing.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, amount, frequency, anchorDate }),
        credentials: "include",
      });
      const data = (await res.json()) as { ok?: boolean; message?: string };
      if (!res.ok) {
        setError(data.message ?? "Update failed.");
        return;
      }
      setEditing(null);
      router.refresh();
    } catch {
      setError("Update failed.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <section className={getCardClasses(theme.paychecks)}>
      <div className="flex flex-wrap items-baseline justify-between gap-2 mb-4">
        <h2 className={getSectionLabelClasses(theme.paychecks)}>
          Next paychecks
        </h2>
        <div className="text-right">
          <p className="text-xs text-neutral-500 dark:text-neutral-400">Paid this month</p>
          <p className="text-sm font-semibold text-neutral-700 dark:text-neutral-300 tabular-nums">
            {paycheckPaidThisMonth !== undefined && paycheckPaidThisMonth > 0
              ? formatCurrency(paycheckPaidThisMonth)
              : "—"}
          </p>
        </div>
      </div>
      <div className="flex items-center gap-2 text-sm text-neutral-600 dark:text-neutral-400 mb-4">
        <span>Today:</span>
        <span className="font-medium text-neutral-800 dark:text-neutral-200">
          {formatDateShort(displayToday)}
        </span>
      </div>
      <ul className="space-y-3">
        {showList ? displayPaychecks.map((p) => {
          const days = daysUntil(displayToday, p.nextDate);
          const isToday = days === 0;
          const isPast = days < 0;
          const isEditing = editing?.id === p.id;
          const billingMonth = p.frequency === "monthlyLastWorkingDay"
            ? billingMonthNameForLastWorkingDay(p.nextDate)
            : null;
          return (
            <li
              key={p.id}
              className="py-2 border-b border-neutral-100 dark:border-neutral-700/50 last:border-0"
            >
              {isEditing ? (
                <form onSubmit={handleSave} className="w-full space-y-2">
                  <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                    <label className="text-xs text-neutral-500 dark:text-neutral-400">
                      Name
                      <input
                        name="name"
                        defaultValue={p.name}
                        className="mt-0.5 block w-full rounded border border-neutral-300 bg-white px-2 py-1 text-sm dark:border-neutral-600 dark:bg-neutral-800"
                      />
                    </label>
                    <label className="text-xs text-neutral-500 dark:text-neutral-400">
                      Amount
                      <input
                        name="amount"
                        type="number"
                        step="0.01"
                        defaultValue={p.amount ?? ""}
                        placeholder="—"
                        className="mt-0.5 block w-full rounded border border-neutral-300 bg-white px-2 py-1 text-sm dark:border-neutral-600 dark:bg-neutral-800"
                      />
                    </label>
                  </div>
                  <label className="block text-xs text-neutral-500 dark:text-neutral-400">
                    Frequency
                    <select
                      name="frequency"
                      defaultValue={p.frequency}
                      className="mt-0.5 block w-full rounded border border-neutral-300 bg-white px-2 py-1 text-sm dark:border-neutral-600 dark:bg-neutral-800"
                    >
                      <option value="biweekly">Biweekly (every other Thu)</option>
                      <option value="monthly">Monthly</option>
                      <option value="monthlyLastWorkingDay">Last working day of month</option>
                    </select>
                  </label>
                  {p.frequency === "biweekly" && (
                    <div className="space-y-1">
                      <label className="block text-xs text-neutral-500 dark:text-neutral-400">
                        Last paycheck date
                        <input
                          name="anchorDate"
                          type="date"
                          defaultValue={p.anchorDate ?? ""}
                          className="mt-0.5 block w-full rounded border border-neutral-300 bg-white px-2 py-1 text-sm dark:border-neutral-600 dark:bg-neutral-800"
                        />
                      </label>
                      <button
                        type="button"
                        onClick={() => {
                          const input = document.querySelector<HTMLInputElement>('input[name="anchorDate"]');
                          if (input) {
                            const today = new Date();
                            input.value = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, "0")}-${String(today.getDate()).padStart(2, "0")}`;
                          }
                        }}
                        className="text-xs text-sky-600 dark:text-sky-400 underline hover:no-underline"
                      >
                        Mark as received today
                      </button>
                    </div>
                  )}
                  {error && <p className="text-xs text-red-600 dark:text-red-400">{error}</p>}
                  <div className="flex gap-2">
                    <button
                      type="submit"
                      disabled={saving}
                      className="rounded bg-neutral-700 px-2 py-1 text-xs font-medium text-white hover:bg-neutral-600 disabled:opacity-50 dark:bg-neutral-300 dark:text-neutral-900"
                    >
                      {saving ? "Saving…" : "Save"}
                    </button>
                    <button
                      type="button"
                      onClick={() => { setEditing(null); setError(null); }}
                      className="rounded border border-neutral-300 px-2 py-1 text-xs font-medium dark:border-neutral-600"
                    >
                      Cancel
                    </button>
                  </div>
                </form>
              ) : (
                <>
                  {/* Line 1: name (left) + date + amount (right, grouped so amount isn't far right) */}
                  <div className="flex items-baseline justify-between gap-2">
                    <span
                      className="font-medium text-neutral-800 dark:text-neutral-200 shrink-0"
                      title={
                        (p.lastEditedBy || p.lastEditedAt)
                          ? [
                              p.lastEditedBy ? `Edited by ${p.lastEditedBy}` : "",
                              p.lastEditedAt
                                ? new Date(p.lastEditedAt).toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" })
                                : "",
                            ].filter(Boolean).join(" · ")
                          : undefined
                      }
                    >
                      {p.name}
                    </span>
                    <div className="flex items-baseline gap-3 shrink-0">
                      <span
                        className={
                          isToday
                            ? "text-amber-600 dark:text-amber-400 font-semibold"
                            : isPast
                              ? "text-neutral-400 dark:text-neutral-500 text-sm italic line-through"
                              : "text-emerald-700 dark:text-emerald-400 font-medium"
                        }
                      >
                        {formatDateNoYear(p.nextDate)}
                      </span>
                      <span className="text-sm font-medium tabular-nums">
                        {p.amount != null && p.amount > 0 ? formatCurrency(p.amount) : "—"}
                      </span>
                    </div>
                  </div>
                  {/* Line 2: freq / days / edit / mark received */}
                  <div className="flex items-center gap-2 mt-0.5 flex-wrap">
                    {billingMonth && (
                      <span className="text-[10px] leading-tight bg-blue-100 dark:bg-blue-900/40 text-blue-700 dark:text-blue-300 rounded px-1 py-0.5 font-medium">
                        for {billingMonth}
                      </span>
                    )}
                    <span className="text-xs text-neutral-500 dark:text-neutral-400">
                      {p.frequency === "biweekly"
                        ? "every other Thu"
                        : p.frequency === "monthlyLastWorkingDay"
                          ? "last working day"
                          : "monthly"}
                      {!isPast && days !== 0 && (
                        <> · {days === 1 ? "tomorrow" : `${days}d`}</>
                      )}
                      {isToday && <> · today</>}
                    </span>
                    {canEdit && !p.id.startsWith("default-") && (
                      <button
                        type="button"
                        onClick={() => setEditing(p)}
                        className="text-xs text-neutral-500 underline hover:text-neutral-700 dark:hover:text-neutral-300"
                      >
                        Edit
                      </button>
                    )}
                    {canEdit && !p.id.startsWith("default-") && p.frequency === "biweekly" && (
                      <button
                        type="button"
                        disabled={markingReceived === p.id}
                        onClick={() => void markReceived(p)}
                        className="text-xs text-emerald-600 dark:text-emerald-400 underline hover:no-underline disabled:opacity-50"
                      >
                        {markingReceived === p.id ? "Saving…" : "Received today"}
                      </button>
                    )}
                  </div>
                  {/* Anchor date hint + error */}
                  {p.frequency === "biweekly" && p.anchorDate && (
                    <p className="text-[10px] text-neutral-400 dark:text-neutral-500 mt-0.5">
                      Last pay: {p.anchorDate}
                    </p>
                  )}
                  {markError[p.id] && (
                    <p className="text-xs text-red-600 dark:text-red-400 mt-0.5">{markError[p.id]}</p>
                  )}
                </>
              )}
            </li>
          );
        }) : (
          <li className="py-2 text-sm text-neutral-500 dark:text-neutral-400">Loading…</li>
        )}
      </ul>
    </section>
  );
}
