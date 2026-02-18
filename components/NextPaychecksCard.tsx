"use client";

import { useState, useMemo } from "react";
import { useRouter } from "next/navigation";
import { formatCurrency } from "@/lib/format";
import { formatDateShort, daysUntil } from "@/lib/paycheckDates";
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
    setSaving(true);
    setError(null);
    try {
      const res = await fetch(`/api/paychecks/${editing.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, amount, frequency }),
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
          return (
            <li
              key={p.id}
              className="flex flex-wrap items-baseline justify-between gap-x-2 gap-y-1 py-2 border-b border-neutral-100 dark:border-neutral-700/50 last:border-0"
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
                    {canEdit && !p.id.startsWith("default-") && (
                      <button
                        type="button"
                        onClick={() => setEditing(p)}
                        className="ml-2 text-xs text-neutral-500 underline hover:text-neutral-700 dark:hover:text-neutral-300"
                      >
                        Edit
                      </button>
                    )}
                    {(p.lastEditedBy || p.lastEditedAt) && (
                      <span className="ml-2 text-[10px] text-neutral-400 dark:text-neutral-500" title={p.lastEditedAt ?? undefined}>
                        {p.lastEditedBy && `Edited by ${p.lastEditedBy}`}
                        {p.lastEditedBy && p.lastEditedAt && " · "}
                        {p.lastEditedAt && new Date(p.lastEditedAt).toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" })}
                      </span>
                    )}
                  </div>
                  <div className="flex items-baseline gap-2">
                    <span
                      className={
                        isToday
                          ? "text-amber-600 dark:text-amber-400 font-semibold"
                          : isPast
                            ? "text-neutral-400 dark:text-neutral-500 text-sm italic line-through"
                            : "text-emerald-700 dark:text-emerald-400 font-medium"
                      }
                    >
                      {formatDateShort(p.nextDate)}
                    </span>
                    {!isPast && (
                      <span className="text-xs text-neutral-500 dark:text-neutral-400">
                        {days === 0 ? "today" : days === 1 ? "tomorrow" : `${days} days`}
                      </span>
                    )}
                    <span className="text-sm font-medium tabular-nums min-w-[4rem] text-right">
                      {p.amount != null && p.amount > 0 ? formatCurrency(p.amount) : "—"}
                    </span>
                  </div>
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
