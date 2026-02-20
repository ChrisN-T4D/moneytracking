"use client";

import { useState, useRef, useCallback, useEffect } from "react";
import { useRouter } from "next/navigation";
import { createPortal } from "react-dom";
import { formatCurrency, displayBillName } from "@/lib/format";
import { formatDateNoYear } from "@/lib/paycheckDates";
import type { SpanishForkBill } from "@/lib/types";
import type { ActualBreakdownItem } from "@/lib/statementTagging";
import { paidCycleStatus } from "@/lib/billCycleUtils";
import { getCardClasses } from "@/lib/themePalettes";
import { useTheme } from "./ThemeProvider";

interface SpanishForkSectionProps {
  bills: SpanishForkBill[];
  title?: string;
  subtitle?: string;
  /** Sum of tagged statement amounts this month for Spanish Fork (section total). */
  paidThisMonth?: number;
  /** Per-bill paid amounts this month, keyed by bill name (case-insensitive). */
  paidByName?: Record<string, number>;
  /** Per-bill list of contributing transactions (for drill-down popup). */
  breakdownByName?: Record<string, ActualBreakdownItem[]>;
  /** When false, tenant paid column is hidden (e.g. when using static/demo bills). */
  editableTenantPaid?: boolean;
  /** When true, show delete button per row (for PocketBase-backed list). */
  canDelete?: boolean;
}

const FREQ_BADGE_BASE = "inline-flex items-center justify-center w-6 h-6 rounded-md text-xs font-bold tabular-nums";

function frequencyBadge(freq: string) {
  const f = (freq ?? "").toLowerCase().replace(/\s/g, "");
  const letter = f === "2weeks" ? "2W" : f === "monthly" ? "M" : f === "yearly" ? "Y" : freq ? freq.slice(0, 1).toUpperCase() : "?";
  const title = f === "2weeks" ? "Every 2 weeks" : f === "monthly" ? "Monthly" : f === "yearly" ? "Yearly" : freq;
  const colorClass =
    f === "2weeks"
      ? "bg-sky-200/90 text-sky-800 dark:bg-sky-800/70 dark:text-sky-200"
      : f === "monthly"
        ? "bg-amber-200/90 text-amber-800 dark:bg-amber-800/70 dark:text-amber-200"
        : f === "yearly"
          ? "bg-emerald-200/90 text-emerald-800 dark:bg-emerald-800/70 dark:text-emerald-200"
          : "bg-neutral-200/90 text-neutral-700 dark:bg-neutral-600/90 dark:text-neutral-200";
  return <span className={`${FREQ_BADGE_BASE} ${colorClass}`} title={title}>{letter}</span>;
}

interface EditState {
  id: string;
  value: string;
  saving: boolean;
  error: string | null;
}

export function SpanishForkSection({ bills: initialBills, title = "Spanish Fork (Rental)", subtitle = "Bills with tenant paid amounts", paidThisMonth, paidByName = {}, breakdownByName = {}, editableTenantPaid = true, canDelete = false }: SpanishForkSectionProps) {
  const { theme } = useTheme();
  const router = useRouter();

  function getBreakdownFor(name: string): ActualBreakdownItem[] | undefined {
    const exact = breakdownByName[name];
    if (exact?.length) return exact;
    const lower = name.toLowerCase();
    for (const [k, v] of Object.entries(breakdownByName)) {
      if (k.toLowerCase() === lower && v?.length) return v;
    }
    return undefined;
  }

  function getPaidFor(name: string): number | undefined {
    const exact = paidByName[name];
    if (exact !== undefined) return exact;
    const lower = name.toLowerCase();
    for (const [k, v] of Object.entries(paidByName)) {
      if (k.toLowerCase() === lower) return v;
    }
    return undefined;
  }

  function effectiveNextDate(bill: SpanishForkBill): Date | null {
    const bd = getBreakdownFor(bill.name);
    const pa = getPaidFor(bill.name);
    const cycle = paidCycleStatus(bill.frequency, bd, pa);
    if (cycle?.isPaid) return cycle.nextCycleDate;
    if (!bill.nextDue) return null;
    return new Date(bill.nextDue);
  }

  function sortBills(list: SpanishForkBill[]): SpanishForkBill[] {
    const now = new Date(); now.setHours(0, 0, 0, 0);
    const twoWeeksOut = new Date(now); twoWeeksOut.setDate(now.getDate() + 14);
    function group(bill: SpanishForkBill): number {
      const bd = getBreakdownFor(bill.name);
      const pa = getPaidFor(bill.name);
      const cycle = paidCycleStatus(bill.frequency, bd, pa);
      const due = effectiveNextDate(bill);
      if (!cycle?.isPaid && due && due < now) return 0; // overdue
      if (!due) return 1;
      if (due <= twoWeeksOut) return 1; // upcoming
      return 2; // far out
    }
    return [...list].sort((a, b) => {
      const ga = group(a); const gb = group(b);
      if (ga !== gb) return ga - gb;
      const da = effectiveNextDate(a)?.getTime() ?? Infinity;
      const db = effectiveNextDate(b)?.getTime() ?? Infinity;
      return da - db;
    });
  }

  const [bills, setBills] = useState<SpanishForkBill[]>(() => sortBills(initialBills));
  const [toggling, setToggling] = useState<string | null>(null);
  const [toggleError, setToggleError] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  // Sync from server when bills list changes
  useEffect(() => {
    setBills(sortBills(initialBills));
  }, [initialBills, paidByName, breakdownByName]);

  const [edit, setEdit] = useState<EditState | null>(null);
  const [breakdownModal, setBreakdownModal] = useState<{ name: string; items: ActualBreakdownItem[] } | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const budgetedTotal = bills.reduce((sum, b) => sum + (b.amount ?? 0), 0);

  const handleTogglePaid = async (bill: SpanishForkBill) => {
    if (!editableTenantPaid) return;
    setToggleError(null);
    const newValue = !bill.tenantPaid;
    setBills((prev) => prev.map((b) => b.id === bill.id ? { ...b, tenantPaid: newValue } : b));
    setToggling(bill.id);
    try {
      const res = await fetch(`/api/spanish-fork-bills/${bill.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ tenantPaid: newValue }),
      });
      const data = (await res.json().catch(() => ({}))) as { message?: string };
      if (!res.ok) {
        setBills((prev) => prev.map((b) => b.id === bill.id ? { ...b, tenantPaid: bill.tenantPaid } : b));
        setToggleError(data.message ?? `Request failed (${res.status})`);
      }
    } catch {
      setBills((prev) => prev.map((b) => b.id === bill.id ? { ...b, tenantPaid: bill.tenantPaid } : b));
      setToggleError("Network error. Check the console.");
    } finally {
      setToggling(null);
    }
  };

  const handleDelete = useCallback(async (bill: SpanishForkBill) => {
    if (!confirm(`Delete "${displayBillName(bill.name)}"?`)) return;
    setDeleteError(null);
    setDeletingId(bill.id);
    try {
      const res = await fetch(`/api/spanish-fork-bills/${bill.id}`, { method: "DELETE" });
      const data = (await res.json().catch(() => ({}))) as { ok?: boolean; message?: string };
      if (!res.ok) {
        setDeleteError(data.message ?? `Error ${res.status}`);
        return;
      }
      router.refresh();
    } catch {
      setDeleteError("Delete failed.");
    } finally {
      setDeletingId(null);
    }
  }, []);

  const startEdit = useCallback((bill: SpanishForkBill) => {
    setEdit({ id: bill.id, value: String(bill.amount ?? ""), saving: false, error: null });
    setTimeout(() => inputRef.current?.select(), 0);
  }, []);

  const cancelEdit = useCallback(() => setEdit(null), []);

  const commitEdit = useCallback(async (bill: SpanishForkBill) => {
    if (!edit || edit.saving) return;
    const raw = edit.value.replace(/[$,\s]/g, "");
    const amount = parseFloat(raw);
    if (Number.isNaN(amount) || amount < 0) {
      setEdit((e) => e ? { ...e, error: "Enter a valid amount" } : null);
      return;
    }
    if (amount === bill.amount) { setEdit(null); return; }

    setEdit((e) => e ? { ...e, saving: true, error: null } : null);
    setBills((prev) => prev.map((b) => b.id === bill.id ? { ...b, amount } : b));

    try {
      const res = await fetch(`/api/spanish-fork-bills/${bill.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ amount }),
      });
      if (!res.ok) {
        const data = (await res.json().catch(() => ({}))) as { message?: string };
        setBills((prev) => prev.map((b) => b.id === bill.id ? { ...b, amount: bill.amount } : b));
        setEdit((e) => e ? { ...e, saving: false, error: data.message ?? "Save failed" } : null);
        return;
      }
      setEdit(null);
    } catch {
      setBills((prev) => prev.map((b) => b.id === bill.id ? { ...b, amount: bill.amount } : b));
      setEdit((e) => e ? { ...e, saving: false, error: "Save failed" } : null);
    }
  }, [edit]);

  return (
    <section className={getCardClasses(theme.spanishFork)}>
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <div>
          <h2 className="text-base font-semibold text-neutral-900 dark:text-neutral-100">
            {title}
          </h2>
          <p className="text-xs text-neutral-500 dark:text-neutral-400 mt-0.5">
            {subtitle}
          </p>
        </div>
        {(paidThisMonth !== undefined || budgetedTotal > 0) && (
          <div className="text-right">
            <p className="text-xs text-neutral-500 dark:text-neutral-400">Paid this month</p>
            <p className="text-sm font-semibold text-neutral-700 dark:text-neutral-300 tabular-nums">
              {(paidThisMonth ?? 0) > 0 ? formatCurrency(paidThisMonth ?? 0) : "—"}
            </p>
            {budgetedTotal > 0 && (
              <p className="text-xs text-neutral-500 dark:text-neutral-400 mt-0.5">
                Budget {formatCurrency(budgetedTotal)}
                {(paidThisMonth ?? 0) > 0 && (
                  <span className={(paidThisMonth ?? 0) > budgetedTotal ? " text-amber-600 dark:text-amber-400" : " text-emerald-600 dark:text-emerald-400"}>
                    {" "}({(paidThisMonth ?? 0) > budgetedTotal ? "over" : "under"})
                  </span>
                )}
              </p>
            )}
          </div>
        )}
      </div>
      {toggleError && (
        <p className="mt-2 text-sm text-amber-600 dark:text-amber-400" role="alert">
          {toggleError}
        </p>
      )}
      {deleteError && (
        <p className="mt-2 text-sm text-red-600 dark:text-red-400" role="alert">
          {deleteError}
        </p>
      )}
      <div className="mt-3 overflow-x-auto -mx-4 px-4">
        <table className="w-full table-fixed text-sm">
          <colgroup>
            <col />{/* Bill name — takes remaining space */}
            <col className="w-10" />{/* Freq badge */}
            <col className="w-20" />{/* Next due */}
            <col className="w-24" />{/* Amount */}
            <col className="w-24" />{/* Paid this month */}
            <col className="w-20" />{/* Tenant paid */}
            {canDelete && <col className="w-9" />}
          </colgroup>
          <thead>
            <tr className="border-b border-neutral-200 dark:border-neutral-600 text-left text-xs text-neutral-500 dark:text-neutral-400">
              <th className="py-2 pr-2 font-medium">Bill</th>
              <th className="py-2 pr-2 font-medium text-center">Freq</th>
              <th className="py-2 pr-2 font-medium">Due / Last paid</th>
              <th className="py-2 pr-2 font-medium text-right">Amount</th>
              <th className="py-2 pr-2 font-medium text-right">Paid this month</th>
              <th className="py-2 font-medium text-center">Tenant paid</th>
              {canDelete && <th className="py-2 pl-2 w-9 text-right" aria-label="Delete" />}
            </tr>
          </thead>
          <tbody>
            {bills.map((bill) => {
              const isPaid = bill.tenantPaid === true;
              const isToggling = toggling === bill.id;
              const isEditing = edit?.id === bill.id;
              const paidAmt = getPaidFor(bill.name);
              const breakdown = getBreakdownFor(bill.name);
              const displayName = displayBillName(bill.name);
              const canShowBreakdown = breakdown && breakdown.length > 0;
              const cycle = paidCycleStatus(bill.frequency, breakdown, paidAmt);
              const today = new Date(); today.setHours(0, 0, 0, 0);
              const dueDate = bill.nextDue ? new Date(bill.nextDue) : null;
              const isOverdue = !cycle?.isPaid && dueDate && dueDate < today;
              return (
                <tr
                  key={bill.id}
                  className="border-b border-neutral-100 dark:border-neutral-700/50 last:border-0"
                >
                  <td className="py-2.5 pr-2 text-neutral-800 dark:text-neutral-200">
                    {canShowBreakdown ? (
                      <button
                        type="button"
                        onClick={() => setBreakdownModal({ name: displayName, items: breakdown })}
                        className="text-left font-medium hover:text-sky-600 dark:hover:text-sky-400 underline-offset-2 hover:underline"
                        title="View transactions for this subsection"
                      >
                        {displayName}
                      </button>
                    ) : (
                      displayName
                    )}
                  </td>
                  <td className="py-2.5 pr-2 text-neutral-600 dark:text-neutral-400 text-center">{frequencyBadge(bill.frequency)}</td>
                  <td className="py-2.5 pr-2 whitespace-nowrap">
                    {cycle?.isPaid ? (
                      <span className="flex flex-col gap-0.5">
                        <span className="text-amber-600 dark:text-amber-400 font-medium text-sm">
                          {formatDateNoYear(cycle.nextCycleDate)}
                        </span>
                        <span className="text-emerald-600 dark:text-emerald-400 text-[10px]">
                          ✓ paid {formatDateNoYear(cycle.lastDate)}
                        </span>
                      </span>
                    ) : bill.nextDue ? (
                      <span className={`font-medium text-sm ${isOverdue ? "text-red-600 dark:text-red-400" : "text-amber-600 dark:text-amber-400"}`}>
                        {formatDateNoYear(new Date(bill.nextDue))}
                      </span>
                    ) : (
                      <span className="text-neutral-400 dark:text-neutral-500">—</span>
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
                              if (e.key === "Enter") { e.preventDefault(); void commitEdit(bill); }
                              if (e.key === "Escape") cancelEdit();
                            }}
                            onBlur={() => void commitEdit(bill)}
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
                        onClick={() => startEdit(bill)}
                        title="Click to edit amount"
                        className="group relative tabular-nums hover:text-blue-600 dark:hover:text-blue-400 transition-colors"
                      >
                        {formatCurrency(bill.amount)}
                        <span className="absolute -right-4 top-1/2 -translate-y-1/2 opacity-0 group-hover:opacity-100 transition-opacity text-blue-400">
                          <svg className="w-3 h-3" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
                            <path d="M11.5 2.5a1.5 1.5 0 0 1 2 2L5 13l-3 1 1-3 8.5-8.5z"/>
                          </svg>
                        </span>
                      </button>
                    )}
                  </td>
                  <td className="py-2.5 pr-2 text-right tabular-nums">
                    {paidAmt !== undefined ? (
                      canShowBreakdown ? (
                        <button
                          type="button"
                          onClick={() => setBreakdownModal({ name: displayName, items: breakdown })}
                          className={paidAmt > (bill.amount ?? 0) ? "text-amber-600 dark:text-amber-400 font-medium hover:underline underline-offset-2" : "text-emerald-600 dark:text-emerald-400 font-medium hover:underline underline-offset-2"}
                          title="View transactions for this subsection"
                        >
                          {formatCurrency(paidAmt)}
                        </button>
                      ) : (
                        <span className={paidAmt > (bill.amount ?? 0) ? "text-amber-600 dark:text-amber-400 font-medium" : "text-emerald-600 dark:text-emerald-400 font-medium"}>
                          {formatCurrency(paidAmt)}
                        </span>
                      )
                    ) : (
                      <span className="text-neutral-300 dark:text-neutral-600">—</span>
                    )}
                  </td>
                  <td className="py-2.5 text-center">
                    {editableTenantPaid ? (
                      <button
                        type="button"
                        disabled={isToggling}
                        onClick={() => handleTogglePaid(bill)}
                        aria-label={isPaid ? "Mark as not paid" : "Mark as paid"}
                        className={[
                          "inline-flex items-center justify-center w-7 h-7 rounded-full border-2 transition-colors",
                          isToggling ? "opacity-50 cursor-wait" : "cursor-pointer",
                          isPaid
                            ? "border-emerald-500 bg-emerald-50 text-emerald-600 hover:bg-emerald-100 dark:bg-emerald-900/30 dark:text-emerald-400 dark:border-emerald-500 dark:hover:bg-emerald-900/50"
                            : "border-neutral-300 bg-white text-neutral-300 hover:border-neutral-400 hover:text-neutral-400 dark:border-neutral-600 dark:bg-neutral-800 dark:text-neutral-600 dark:hover:border-neutral-500",
                        ].join(" ")}
                      >
                        {isPaid ? (
                          <svg className="w-4 h-4" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round">
                            <path d="M3 8l3.5 3.5L13 4.5" />
                          </svg>
                        ) : (
                          <svg className="w-3.5 h-3.5" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth={2.5} strokeLinecap="round">
                            <path d="M4 4l8 8M12 4l-8 8" />
                          </svg>
                        )}
                      </button>
                    ) : (
                      <span
                        className={[
                          "inline-flex items-center justify-center w-7 h-7 rounded-full border-2",
                          isPaid
                            ? "border-emerald-500 bg-emerald-50 text-emerald-600 dark:bg-emerald-900/30 dark:text-emerald-400 dark:border-emerald-500"
                            : "border-neutral-300 bg-white text-neutral-300 dark:border-neutral-600 dark:bg-neutral-800 dark:text-neutral-600",
                        ].join(" ")}
                        aria-hidden
                      >
                        {isPaid ? (
                          <svg className="w-4 h-4" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round">
                            <path d="M3 8l3.5 3.5L13 4.5" />
                          </svg>
                        ) : (
                          <svg className="w-3.5 h-3.5" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth={2.5} strokeLinecap="round">
                            <path d="M4 4l8 8M12 4l-8 8" />
                          </svg>
                        )}
                      </span>
                    )}
                  </td>
                  {canDelete && (
                    <td className="py-2.5 pl-2 text-right">
                      <button
                        type="button"
                        onClick={() => handleDelete(bill)}
                        disabled={deletingId === bill.id}
                        className="rounded p-1 text-neutral-400 hover:text-red-600 hover:bg-red-50 dark:hover:text-red-400 dark:hover:bg-red-950/40 disabled:opacity-50"
                        title="Delete this bill"
                        aria-label={`Delete ${displayName}`}
                      >
                        <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
                          <path strokeLinecap="round" strokeLinejoin="round" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                        </svg>
                      </button>
                    </td>
                  )}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {breakdownModal &&
        typeof document !== "undefined" &&
        createPortal(
          <div
            className="fixed inset-0 z-[100] flex min-h-[100dvh] items-center justify-center bg-neutral-950/70 p-4 backdrop-blur-sm"
            onClick={() => setBreakdownModal(null)}
            role="dialog"
            aria-modal="true"
            aria-labelledby="breakdown-modal-title-sf"
          >
            <div
              className="bg-white dark:bg-neutral-900 rounded-2xl shadow-2xl max-w-lg w-full max-h-[85vh] flex flex-col border border-neutral-200 dark:border-neutral-700 overflow-hidden"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="shrink-0 flex items-center justify-between px-4 py-3 border-b border-neutral-200 dark:border-neutral-700">
                <h3 id="breakdown-modal-title-sf" className="text-sm font-semibold text-neutral-900 dark:text-neutral-100">
                  Transactions: {breakdownModal.name}
                </h3>
                <button
                  type="button"
                  onClick={() => setBreakdownModal(null)}
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
                  const byMonth = new Map<string, ActualBreakdownItem[]>();
                  for (const t of breakdownModal.items) {
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
    </section>
  );
}
