"use client";

import { useState, useRef, useCallback, useEffect } from "react";
import { useRouter } from "next/navigation";
import { createPortal } from "react-dom";
import { formatCurrency, displayBillName } from "@/lib/format";
import { formatDateForDue, formatDateNoYear } from "@/lib/paycheckDates";
import type { BillOrSub, Frequency } from "@/lib/types";
import { isGroupedBillId } from "@/lib/pocketbase";
import type { ActualBreakdownItem } from "@/lib/statementTagging";
import { getCardClasses } from "@/lib/themePalettes";
import { useTheme } from "./ThemeProvider";
import { addCycle as addCycleUtil, lastPaidDate, paidCycleStatus as paidCycleStatusUtil } from "@/lib/billCycleUtils";

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
  /** Per-bill list of contributing transactions (for drill-down popup). Key = lowercase bill name. */
  breakdownByName?: Record<string, ActualBreakdownItem[]>;
  /** When true, show delete button per row (for PocketBase-backed lists). */
  canDelete?: boolean;
  /** Next biweekly paycheck date — used when changing a bill to 2-week frequency. */
  paycheckEndDate?: Date | null;
}

const FREQ_BADGE_BASE = "inline-flex items-center justify-center w-6 h-6 rounded-md text-xs font-bold tabular-nums";

const addCycle = addCycleUtil;

function paidCycleStatus(
  item: BillOrSub,
  breakdown: ActualBreakdownItem[] | undefined,
  paidAmt: number | undefined
): { isPaid: boolean; lastDate: Date; nextCycleDate: Date } | null {
  return paidCycleStatusUtil(item.frequency, breakdown, paidAmt);
}

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

export function BillsList({ title, subtitle, items: initialItems, monthlySpending, budgetedTotal, paidByName = {}, breakdownByName = {}, canDelete = false, paycheckEndDate }: BillsListProps) {
  const { theme } = useTheme();
  const router = useRouter();

  // Lookup helpers — defined before sortBills so they're available in its closure
  function getBreakdownForItem(name: string): ActualBreakdownItem[] | undefined {
    const exact = breakdownByName[name];
    if (exact?.length) return exact;
    const lower = name.toLowerCase();
    for (const [k, v] of Object.entries(breakdownByName)) {
      if (k.toLowerCase() === lower && v?.length) return v;
    }
    const display = displayBillName(name);
    if (display !== name) {
      const displayExact = breakdownByName[display];
      if (displayExact?.length) return displayExact;
      const displayLower = display.toLowerCase();
      for (const [k, v] of Object.entries(breakdownByName)) {
        if (k.toLowerCase() === displayLower && v?.length) return v;
      }
    }
    return undefined;
  }

  function getPaidForItem(name: string): number | undefined {
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
  }

  /** Effective next date for an item — nextCycleDate if paid, else nextDue. Used for sorting and in-paycheck check. */
  function effectiveNextDate(item: BillOrSub): Date | null {
    const bd = getBreakdownForItem(item.name);
    const pa = getPaidForItem(item.name);
    const cycle = paidCycleStatus(item, bd, pa ?? undefined);
    if (cycle?.isPaid) return cycle.nextCycleDate;
    if (!item.nextDue) return null;
    return new Date(item.nextDue);
  }

  function sortBills(list: BillOrSub[]): BillOrSub[] {
    const now = new Date();
    now.setHours(0, 0, 0, 0);
    const twoWeeksOut = new Date(now);
    twoWeeksOut.setDate(twoWeeksOut.getDate() + 14);

    function itemGroup(item: BillOrSub): number {
      const bd = getBreakdownForItem(item.name);
      const pa = getPaidForItem(item.name);
      const cycle = paidCycleStatus(item, bd, pa ?? undefined);
      const due = effectiveNextDate(item);
      // Only group 0 (top/red) for unpaid items that are overdue
      if (!cycle?.isPaid && due && due < now) return 0;
      // No due date — middle
      if (!due) return 1;
      // Within 2 weeks — middle (regardless of paid status, so Mar 2 paid sorts with Mar 3 unpaid)
      if (due <= twoWeeksOut) return 1;
      // Far out — bottom
      return 2;
    }

    return [...list].sort((a, b) => {
      const ga = itemGroup(a);
      const gb = itemGroup(b);
      if (ga !== gb) return ga - gb;
      // Within same group: sort by effective date ascending
      const da = effectiveNextDate(a)?.getTime() ?? Infinity;
      const db = effectiveNextDate(b)?.getTime() ?? Infinity;
      return da - db;
    });
  }

  const [items, setItems] = useState<BillOrSub[]>(() => sortBills(initialItems));
  const [edit, setEdit] = useState<EditState | null>(null);
  const [breakdownModal, setBreakdownModal] = useState<{ name: string; items: ActualBreakdownItem[] } | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // Re-sort whenever items or paid/breakdown data changes
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => {
    setItems(sortBills(initialItems));
  }, [initialItems, paidByName, breakdownByName]);

  const budget = budgetedTotal ?? items.reduce((sum, i) => sum + (i.amount ?? 0), 0);
  const paid = monthlySpending ?? 0;
  const hasBudget = budget > 0;

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

  const handleDelete = useCallback(async (item: BillOrSub) => {
    if (isGroupedBillId(item.id)) return;
    if (!confirm(`Delete "${displayBillName(item.name)}"?`)) return;
    setDeleteError(null);
    setDeletingId(item.id);
    try {
      const res = await fetch(`/api/bills/${item.id}`, { method: "DELETE" });
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

  return (
    <section className={getCardClasses(theme.bills)}>
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <div>
          <h2 className="text-base font-semibold text-neutral-900 dark:text-neutral-100">{title}</h2>
          {subtitle && (
            <p className="text-xs text-neutral-500 dark:text-neutral-400 mt-0.5">{subtitle}</p>
          )}
        </div>
        {deleteError && (
          <p className="text-xs text-red-600 dark:text-red-400 mt-1">{deleteError}</p>
        )}
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
        <table className="w-full table-fixed text-sm">
          <colgroup>
            <col />{/* Name — takes remaining space */}
            <col className="w-10" />{/* Freq badge */}
            <col className="w-20" />{/* Next due */}
            <col className="w-16" />{/* This paycheck? */}
            <col className="w-24" />{/* Amount */}
            <col className="w-24" />{/* Paid this month */}
            {canDelete && <col className="w-9" />}
          </colgroup>
          <thead>
            <tr className="border-b border-neutral-200 dark:border-neutral-600 text-left text-xs text-neutral-500 dark:text-neutral-400">
              <th className="py-2 pr-2 font-medium">Name</th>
              <th className="py-2 pr-2 font-medium text-center">Freq</th>
              <th className="py-2 pr-2 font-medium">Due / Last paid</th>
              <th className="py-2 pr-2 font-medium text-center">Left in paycheck</th>
              <th className="py-2 pr-2 font-medium text-right">Amount</th>
              <th className="py-2 font-medium text-right">Paid this cycle</th>
              {canDelete && <th className="py-2 pl-2 w-9 text-right" aria-label="Delete" />}
            </tr>
          </thead>
          <tbody>
            {items.map((item) => {
              const isEditing = edit?.id === item.id;
              const paidAmt = getPaidForItem(item.name);
              const breakdown = getBreakdownForItem(item.name);
              const displayName = displayBillName(item.name);
              const canShowBreakdown = breakdown && breakdown.length > 0;
              return (
                <tr
                  key={item.id}
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
                  <td className="py-2.5 pr-2 text-neutral-600 dark:text-neutral-400 text-center">
                    {canDelete && !isGroupedBillId(item.id) ? (
                      <button
                        type="button"
                        title="Click to change frequency (monthly → 2 weeks → yearly)"
                        onClick={async () => {
                          const order: Frequency[] = ["monthly", "2weeks", "yearly"];
                          const next: Frequency = order[(order.indexOf(item.frequency) + 1) % order.length];
                          // When switching to 2-week, align nextDue to the next paycheck date
                          const nextDue = next === "2weeks" && paycheckEndDate
                            ? paycheckEndDate.toISOString().slice(0, 10)
                            : item.nextDue;
                          setItems((cur) => cur.map((i) => i.id === item.id ? { ...i, frequency: next, nextDue } : i));
                          try {
                            await fetch(`/api/bills/${item.id}`, {
                              method: "PATCH",
                              headers: { "Content-Type": "application/json" },
                              body: JSON.stringify({ frequency: next, nextDue }),
                            });
                          } catch {
                            setItems((cur) => cur.map((i) => i.id === item.id ? { ...i, frequency: item.frequency, nextDue: item.nextDue } : i));
                          }
                        }}
                        className="hover:opacity-70 transition-opacity"
                      >
                        {frequencyBadge(item.frequency)}
                      </button>
                    ) : (
                      frequencyBadge(item.frequency)
                    )}
                  </td>
                  <td className="py-2.5 pr-2 whitespace-nowrap">
                    {(() => {
                      const cycle = paidCycleStatus(item, breakdown, paidAmt);
                      const today = new Date(); today.setHours(0,0,0,0);

                      if (cycle?.isPaid) {
                        // Paid this cycle — next due (big) + last paid (small)
                        return (
                          <span className="flex flex-col gap-0.5">
                            <span className="text-amber-600 dark:text-amber-400 font-medium text-sm">
                              {formatDateNoYear(cycle.nextCycleDate)}
                            </span>
                            <span className="text-emerald-600 dark:text-emerald-400 text-[10px]">
                              ✓ paid {formatDateNoYear(cycle.lastDate)}
                            </span>
                          </span>
                        );
                      }

                      if (!item.nextDue) {
                        return <span className="text-neutral-400 dark:text-neutral-500">—</span>;
                      }

                      const dueDate = new Date(item.nextDue);
                      const isOverdue = dueDate < today;
                      const dueDateStr = formatDateForDue(item.nextDue, item.frequency);
                      const dateColor = isOverdue
                        ? "text-red-600 dark:text-red-400"
                        : "text-amber-600 dark:text-amber-400";

                      return canDelete ? (
                        <button
                          type="button"
                          title="Click to clear next due date (for ongoing spending trackers)"
                          onClick={async () => {
                            const prev = item.nextDue;
                            setItems((cur) => cur.map((i) => i.id === item.id ? { ...i, nextDue: "" } : i));
                            try {
                              const endpoint = isGroupedBillId(item.id)
                                ? `/api/bills/clear-due?name=${encodeURIComponent(item.name)}`
                                : `/api/bills/${item.id}`;
                              const res = await fetch(endpoint, {
                                method: "PATCH",
                                headers: { "Content-Type": "application/json" },
                                body: JSON.stringify({ nextDue: "" }),
                              });
                              if (!res.ok) setItems((cur) => cur.map((i) => i.id === item.id ? { ...i, nextDue: prev } : i));
                            } catch {
                              setItems((cur) => cur.map((i) => i.id === item.id ? { ...i, nextDue: prev } : i));
                            }
                          }}
                          className={`text-left font-medium text-sm ${dateColor} hover:underline underline-offset-2 transition-colors`}
                        >
                          {dueDateStr}
                        </button>
                      ) : (
                        <span className={`font-medium text-sm ${dateColor}`}>
                          {dueDateStr}
                        </span>
                      );
                    })()}
                  </td>
                  <td className="py-2.5 pr-2 text-center">
                    {(() => {
                      const now = new Date(); now.setHours(0, 0, 0, 0);
                      // Use the actual paycheck end date if available, otherwise fall back to +14 days
                      const paycheckEnd = paycheckEndDate ?? (() => { const d = new Date(now); d.setDate(d.getDate() + 14); return d; })();
                      // Current cycle window: paycheckEnd - 14 days → paycheckEnd
                      const paycheckStart = new Date(paycheckEnd.getTime() - 14 * 24 * 60 * 60 * 1000);

                      const cycle = paidCycleStatus(item, breakdown, paidAmt);
                      let inPaycheck = false;
                      if (cycle?.isPaid) {
                        // Already paid this cycle — never show in "left in paycheck"
                        inPaycheck = false;
                      } else if (cycle && !cycle.isPaid) {
                        // Has payment history but overdue — use nextCycleDate as the due date
                        inPaycheck = cycle.nextCycleDate <= paycheckEnd;
                      } else if (item.nextDue) {
                        // No transaction history — due on or before paycheck end (including overdue)
                        inPaycheck = new Date(item.nextDue) <= paycheckEnd;
                      }
                      return inPaycheck ? (
                        <span className="inline-flex items-center justify-center w-6 h-6 rounded-full bg-emerald-100 dark:bg-emerald-900/40 text-emerald-600 dark:text-emerald-400 text-xs font-medium">
                          ✓
                        </span>
                      ) : (
                        <span className="text-neutral-300 dark:text-neutral-500">—</span>
                      );
                    })()}
                  </td>
                  <td className="py-2.5 pr-2 text-right font-medium tabular-nums">
                    {isGroupedBillId(item.id) ? (
                      <span className="tabular-nums">{formatCurrency(item.amount)}</span>
                    ) : isEditing ? (
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
                      canShowBreakdown ? (
                        <button
                          type="button"
                          onClick={() => setBreakdownModal({ name: displayName, items: breakdown })}
                          className={paidAmt > (item.amount ?? 0) ? "text-amber-600 dark:text-amber-400 font-medium hover:underline underline-offset-2" : "text-emerald-600 dark:text-emerald-400 font-medium hover:underline underline-offset-2"}
                          title="View transactions for this subsection"
                        >
                          {formatCurrency(paidAmt)}
                        </button>
                      ) : (
                        <span className={paidAmt > (item.amount ?? 0) ? "text-amber-600 dark:text-amber-400 font-medium" : "text-emerald-600 dark:text-emerald-400 font-medium"}>
                          {formatCurrency(paidAmt)}
                        </span>
                      )
                    ) : (
                      <span className="text-neutral-300 dark:text-neutral-600">—</span>
                    )}
                  </td>
                  {canDelete && (
                    <td className="py-2.5 pl-2 text-right">
                      {!isGroupedBillId(item.id) ? (
                        <button
                          type="button"
                          onClick={() => handleDelete(item)}
                          disabled={deletingId === item.id}
                          className="rounded p-1 text-neutral-400 hover:text-red-600 hover:bg-red-50 dark:hover:text-red-400 dark:hover:bg-red-950/40 disabled:opacity-50"
                          title="Delete this bill"
                          aria-label={`Delete ${displayName}`}
                        >
                          <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
                            <path strokeLinecap="round" strokeLinejoin="round" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                          </svg>
                        </button>
                      ) : null}
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
            aria-labelledby="breakdown-modal-title"
          >
            <div
              className="bg-white dark:bg-neutral-900 rounded-2xl shadow-2xl max-w-lg w-full max-h-[85vh] flex flex-col border border-neutral-200 dark:border-neutral-700 overflow-hidden"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="shrink-0 flex items-center justify-between px-4 py-3 border-b border-neutral-200 dark:border-neutral-700">
                <h3 id="breakdown-modal-title" className="text-sm font-semibold text-neutral-900 dark:text-neutral-100">
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
