"use client";

import { useState, useMemo } from "react";
import { formatCurrency, displayBillName } from "@/lib/format";
import { buildRecurringEvents, type RecurringEvent } from "@/lib/recurringEvents";
import type { PaycheckConfig, AutoTransfer, SpanishForkBill } from "@/lib/types";
import type { BillOrSubWithMeta } from "@/lib/pocketbase";
import { getCardClasses } from "@/lib/themePalettes";
import { useTheme } from "./ThemeProvider";

interface RecurringTabProps {
  paycheckConfigs: PaycheckConfig[];
  billsWithMeta: BillOrSubWithMeta[];
  spanishForkBills: SpanishForkBill[];
  autoTransfers: AutoTransfer[];
  paidThisMonthByBill: Map<string, number>;
  paidThisMonthByAccount: { checking: number; bills: number; spanishFork: number };
  incomeThisMonth: number;
  today: Date;
}

const ACCOUNT_LABELS: Record<string, string> = {
  bills_account: "Oklahoma Bills",
  checking_account: "Joint Checking",
  spanish_fork: "Spanish Fork",
};

function accountLabel(account: string): string {
  const lower = (account ?? "").toLowerCase().replace(/\s/g, "_");
  if (lower.includes("bills") && !lower.includes("spanish")) return ACCOUNT_LABELS.bills_account;
  if (lower.includes("spanish")) return ACCOUNT_LABELS.spanish_fork;
  if (lower.includes("checking")) return ACCOUNT_LABELS.checking_account;
  return ACCOUNT_LABELS[account] ?? account;
}

function toYMD(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

export function RecurringTab({
  paycheckConfigs,
  billsWithMeta,
  spanishForkBills,
  autoTransfers,
  paidThisMonthByBill,
  paidThisMonthByAccount,
  incomeThisMonth,
  today,
}: RecurringTabProps) {
  const { theme } = useTheme();
  const [viewMonth, setViewMonth] = useState(() => new Date(today.getFullYear(), today.getMonth(), 1));
  const [view, setView] = useState<"list" | "calendar">("list");

  const year = viewMonth.getFullYear();
  const month = viewMonth.getMonth();
  const monthName = viewMonth.toLocaleString("en-US", { month: "long", year: "numeric" });
  const isCurrentMonth = today.getFullYear() === year && today.getMonth() === month;
  const todayYMD = toYMD(today);

  const events = useMemo(
    () => buildRecurringEvents(paycheckConfigs, billsWithMeta, spanishForkBills, autoTransfers, year, month, paidThisMonthByBill),
    [paycheckConfigs, billsWithMeta, spanishForkBills, autoTransfers, year, month, paidThisMonthByBill]
  );

  const totalIncome = events.filter((e) => e.type === "income").reduce((s, e) => s + e.amount, 0);
  const totalExpenses = events.filter((e) => e.type === "expense").reduce((s, e) => s + e.amount, 0);
  const totalTransfers = events.filter((e) => e.type === "transfer").reduce((s, e) => s + e.amount, 0);

  const paidExpenses = isCurrentMonth
    ? paidThisMonthByAccount.checking + paidThisMonthByAccount.bills + paidThisMonthByAccount.spanishFork
    : 0;
  const receivedIncome = isCurrentMonth ? incomeThisMonth : 0;
  const remainingIncome = Math.max(0, totalIncome - receivedIncome);
  const remainingExpenses = Math.max(0, totalExpenses - paidExpenses);

  // Per-account totals
  const incomeByAccount = useMemo(() => {
    const m: Record<string, number> = {};
    for (const e of events) {
      if (e.type === "income") {
        const key = e.account;
        m[key] = (m[key] ?? 0) + e.amount;
      }
    }
    return m;
  }, [events]);

  const expenseByAccount = useMemo(() => {
    const m: Record<string, number> = {};
    for (const e of events) {
      if (e.type === "expense") {
        const key = e.account;
        m[key] = (m[key] ?? 0) + e.amount;
      }
    }
    return m;
  }, [events]);

  function goToday() { setViewMonth(new Date(today.getFullYear(), today.getMonth(), 1)); }
  function prevMonth() { setViewMonth(new Date(year, month - 1, 1)); }
  function nextMonth() { setViewMonth(new Date(year, month + 1, 1)); }

  // Build calendar grid
  const calendarWeeks = useMemo(() => {
    const firstDay = new Date(year, month, 1).getDay();
    const daysInMonth = new Date(year, month + 1, 0).getDate();
    const weeks: (number | null)[][] = [];
    let week: (number | null)[] = Array(firstDay).fill(null);
    for (let d = 1; d <= daysInMonth; d++) {
      week.push(d);
      if (week.length === 7) { weeks.push(week); week = []; }
    }
    if (week.length > 0) {
      while (week.length < 7) week.push(null);
      weeks.push(week);
    }
    return weeks;
  }, [year, month]);

  // Group events by day for calendar
  const eventsByDay = useMemo(() => {
    const m = new Map<number, RecurringEvent[]>();
    for (const e of events) {
      const day = parseInt(e.date.slice(8, 10), 10);
      if (!m.has(day)) m.set(day, []);
      m.get(day)!.push(e);
    }
    return m;
  }, [events]);

  // Upcoming events (after today) for list view
  const upcomingEvents = useMemo(() => {
    if (isCurrentMonth) {
      return events.filter((e) => e.date >= todayYMD);
    }
    return events;
  }, [events, isCurrentMonth, todayYMD]);

  const pastEvents = useMemo(() => {
    if (isCurrentMonth) {
      return events.filter((e) => e.date < todayYMD);
    }
    return [];
  }, [events, isCurrentMonth, todayYMD]);

  return (
    <div className="space-y-4">
      {/* Month nav */}
      <div className={getCardClasses(theme.summary)}>
        <div className="flex items-center justify-between gap-2">
          <button type="button" onClick={prevMonth} className="rounded-lg p-2 hover:bg-neutral-100 dark:hover:bg-neutral-800" aria-label="Previous month">
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" /></svg>
          </button>
          <div className="text-center">
            <h2 className="text-lg font-semibold text-neutral-900 dark:text-neutral-100">{monthName}</h2>
          </div>
          <button type="button" onClick={nextMonth} className="rounded-lg p-2 hover:bg-neutral-100 dark:hover:bg-neutral-800" aria-label="Next month">
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" /></svg>
          </button>
        </div>
        <div className="flex items-center justify-center gap-2 mt-2">
          {!isCurrentMonth && (
            <button type="button" onClick={goToday} className="rounded-lg border border-neutral-300 dark:border-neutral-600 px-3 py-1 text-xs font-medium text-neutral-700 dark:text-neutral-300 hover:bg-neutral-100 dark:hover:bg-neutral-800">
              Today
            </button>
          )}
          <div className="flex rounded-lg border border-neutral-300 dark:border-neutral-600 overflow-hidden">
            <button type="button" onClick={() => setView("list")} className={`px-3 py-1 text-xs font-medium transition-colors ${view === "list" ? "bg-sky-600 text-white" : "text-neutral-600 dark:text-neutral-400 hover:bg-neutral-100 dark:hover:bg-neutral-800"}`}>
              List
            </button>
            <button type="button" onClick={() => setView("calendar")} className={`px-3 py-1 text-xs font-medium transition-colors ${view === "calendar" ? "bg-sky-600 text-white" : "text-neutral-600 dark:text-neutral-400 hover:bg-neutral-100 dark:hover:bg-neutral-800"}`}>
              Calendar
            </button>
          </div>
        </div>
      </div>

      {/* Summary bars */}
      <div className="grid grid-cols-2 gap-3">
        <div className={getCardClasses(theme.summary)}>
          <p className="text-[11px] font-medium text-neutral-500 dark:text-neutral-400 uppercase tracking-wider">Income</p>
          <p className="text-lg font-semibold text-emerald-600 dark:text-emerald-400 tabular-nums">{formatCurrency(totalIncome)}</p>
          {isCurrentMonth && (
            <div className="mt-1 space-y-0.5">
              <div className="flex justify-between text-[11px]">
                <span className="text-neutral-500 dark:text-neutral-400">Received</span>
                <span className="text-emerald-600 dark:text-emerald-400 tabular-nums">{formatCurrency(receivedIncome)}</span>
              </div>
              <div className="flex justify-between text-[11px]">
                <span className="text-neutral-500 dark:text-neutral-400">Remaining</span>
                <span className="text-neutral-600 dark:text-neutral-300 tabular-nums">{formatCurrency(remainingIncome)}</span>
              </div>
              <div className="h-1.5 w-full rounded-full bg-neutral-200 dark:bg-neutral-700 mt-1 overflow-hidden">
                <div className="h-full rounded-full bg-emerald-500" style={{ width: `${totalIncome > 0 ? Math.min(100, (receivedIncome / totalIncome) * 100) : 0}%` }} />
              </div>
            </div>
          )}
        </div>
        <div className={getCardClasses(theme.summary)}>
          <p className="text-[11px] font-medium text-neutral-500 dark:text-neutral-400 uppercase tracking-wider">Expenses</p>
          <p className="text-lg font-semibold text-red-600 dark:text-red-400 tabular-nums">{formatCurrency(totalExpenses)}</p>
          {isCurrentMonth && (
            <div className="mt-1 space-y-0.5">
              <div className="flex justify-between text-[11px]">
                <span className="text-neutral-500 dark:text-neutral-400">Paid</span>
                <span className="text-red-600 dark:text-red-400 tabular-nums">{formatCurrency(paidExpenses)}</span>
              </div>
              <div className="flex justify-between text-[11px]">
                <span className="text-neutral-500 dark:text-neutral-400">Remaining</span>
                <span className="text-neutral-600 dark:text-neutral-300 tabular-nums">{formatCurrency(remainingExpenses)}</span>
              </div>
              <div className="h-1.5 w-full rounded-full bg-neutral-200 dark:bg-neutral-700 mt-1 overflow-hidden">
                <div className="h-full rounded-full bg-red-500" style={{ width: `${totalExpenses > 0 ? Math.min(100, (paidExpenses / totalExpenses) * 100) : 0}%` }} />
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Calendar view */}
      {view === "calendar" && (
        <div className={getCardClasses(theme.summary)}>
          <div className="overflow-x-auto">
            <table className="w-full text-xs border-collapse">
              <thead>
                <tr>
                  {["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].map((d) => (
                    <th key={d} className="py-1.5 text-center font-medium text-neutral-500 dark:text-neutral-400 w-[14.28%]">{d}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {calendarWeeks.map((week, wi) => (
                  <tr key={wi}>
                    {week.map((day, di) => {
                      const dayYMD = day ? `${year}-${String(month + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}` : null;
                      const isToday = dayYMD === todayYMD;
                      const dayEvents = day ? (eventsByDay.get(day) ?? []) : [];
                      return (
                        <td key={di} className={`border border-neutral-200 dark:border-neutral-700 align-top p-1 min-h-[72px] h-[72px] ${day ? "" : "bg-neutral-50 dark:bg-neutral-900/50"}`}>
                          {day && (
                            <>
                              <span className={`text-[11px] font-medium ${isToday ? "bg-sky-600 text-white rounded-full px-1.5 py-0.5" : "text-neutral-700 dark:text-neutral-300"}`}>
                                {day}
                              </span>
                              <div className="mt-0.5 space-y-0.5 max-h-[48px] overflow-hidden">
                                {dayEvents.slice(0, 3).map((e) => (
                                  <div
                                    key={e.id}
                                    className={`truncate text-[9px] leading-tight rounded px-1 py-0.5 ${
                                      e.type === "income"
                                        ? "bg-emerald-100 text-emerald-800 dark:bg-emerald-900/50 dark:text-emerald-300"
                                        : e.type === "transfer"
                                          ? "bg-sky-100 text-sky-800 dark:bg-sky-900/50 dark:text-sky-300"
                                          : e.isPaid
                                            ? "bg-neutral-100 text-neutral-500 dark:bg-neutral-800 dark:text-neutral-500 line-through"
                                            : "bg-red-50 text-red-700 dark:bg-red-900/30 dark:text-red-300"
                                    }`}
                                    title={`${displayBillName(e.name)} ${formatCurrency(e.amount)}`}
                                  >
                                    {displayBillName(e.name)} <span className="tabular-nums">{formatCurrency(e.amount)}</span>
                                  </div>
                                ))}
                                {dayEvents.length > 3 && (
                                  <div className="text-[9px] text-neutral-500">+{dayEvents.length - 3} more</div>
                                )}
                              </div>
                            </>
                          )}
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* List view */}
      {view === "list" && (
        <div className={getCardClasses(theme.summary)}>
          {upcomingEvents.length > 0 && (
            <>
              <h3 className="text-xs font-semibold text-neutral-500 dark:text-neutral-400 uppercase tracking-wider mb-2">
                {isCurrentMonth ? "Upcoming" : "All"}
              </h3>
              <div className="overflow-x-auto">
                <table className="w-full text-xs">
                  <thead>
                    <tr className="border-b border-neutral-200 dark:border-neutral-700">
                      <th className="py-1.5 text-left font-medium text-neutral-500 dark:text-neutral-400">Name</th>
                      <th className="py-1.5 text-left font-medium text-neutral-500 dark:text-neutral-400">Date</th>
                      <th className="py-1.5 text-left font-medium text-neutral-500 dark:text-neutral-400">Account</th>
                      <th className="py-1.5 text-right font-medium text-neutral-500 dark:text-neutral-400">Amount</th>
                      <th className="py-1.5 text-left font-medium text-neutral-500 dark:text-neutral-400 hidden sm:table-cell">Recurrence</th>
                    </tr>
                  </thead>
                  <tbody>
                    {upcomingEvents.map((e) => {
                      const d = new Date(e.date + "T00:00:00");
                      const dateStr = d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
                      return (
                        <tr key={e.id} className="border-b border-neutral-100 dark:border-neutral-800 last:border-0">
                          <td className="py-2 pr-2">
                            <div className="flex items-center gap-1.5">
                              <span className={`w-2 h-2 rounded-full shrink-0 ${e.type === "income" ? "bg-emerald-500" : e.type === "transfer" ? "bg-sky-500" : "bg-red-400"}`} />
                              <span className="text-neutral-900 dark:text-neutral-100 truncate max-w-[160px]" title={e.name}>
                                {displayBillName(e.name)}
                              </span>
                            </div>
                          </td>
                          <td className="py-2 pr-2 text-neutral-600 dark:text-neutral-400 whitespace-nowrap">{dateStr}</td>
                          <td className="py-2 pr-2 text-neutral-600 dark:text-neutral-400 truncate max-w-[100px]">{accountLabel(e.account)}</td>
                          <td className={`py-2 text-right tabular-nums font-medium whitespace-nowrap ${e.type === "income" ? "text-emerald-600 dark:text-emerald-400" : e.type === "transfer" ? "text-sky-600 dark:text-sky-400" : "text-red-600 dark:text-red-400"}`}>
                            {e.type === "income" ? "+" : e.type === "transfer" ? "" : ""}{formatCurrency(e.amount)}
                          </td>
                          <td className="py-2 text-neutral-500 dark:text-neutral-400 hidden sm:table-cell whitespace-nowrap">{e.recurrence}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </>
          )}

          {isCurrentMonth && pastEvents.length > 0 && (
            <details className="mt-4">
              <summary className="text-xs font-semibold text-neutral-500 dark:text-neutral-400 uppercase tracking-wider cursor-pointer hover:text-neutral-700 dark:hover:text-neutral-300">
                Past ({pastEvents.length})
              </summary>
              <div className="overflow-x-auto mt-2">
                <table className="w-full text-xs">
                  <tbody>
                    {pastEvents.map((e) => {
                      const d = new Date(e.date + "T00:00:00");
                      const dateStr = d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
                      return (
                        <tr key={e.id} className="border-b border-neutral-100 dark:border-neutral-800 last:border-0 opacity-60">
                          <td className="py-1.5 pr-2">
                            <div className="flex items-center gap-1.5">
                              <span className={`w-2 h-2 rounded-full shrink-0 ${e.type === "income" ? "bg-emerald-500" : e.type === "transfer" ? "bg-sky-500" : "bg-red-400"}`} />
                              <span className="text-neutral-900 dark:text-neutral-100 truncate max-w-[160px]">{displayBillName(e.name)}</span>
                            </div>
                          </td>
                          <td className="py-1.5 pr-2 text-neutral-500 dark:text-neutral-500 whitespace-nowrap">{dateStr}</td>
                          <td className="py-1.5 pr-2 text-neutral-500 dark:text-neutral-500 truncate max-w-[100px]">{accountLabel(e.account)}</td>
                          <td className={`py-1.5 text-right tabular-nums font-medium whitespace-nowrap ${e.type === "income" ? "text-emerald-600/60 dark:text-emerald-400/60" : "text-red-600/60 dark:text-red-400/60"}`}>
                            {formatCurrency(e.amount)}
                          </td>
                          <td className="py-1.5 text-neutral-400 hidden sm:table-cell whitespace-nowrap">{e.recurrence}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </details>
          )}

          {events.length === 0 && (
            <p className="text-sm text-neutral-500 dark:text-neutral-400 text-center py-4">No recurring items for this month.</p>
          )}
        </div>
      )}

      {/* Per-account totals */}
      <div className={getCardClasses(theme.summary)}>
        <h3 className="text-xs font-semibold text-neutral-500 dark:text-neutral-400 uppercase tracking-wider mb-2">Totals by account</h3>
        <div className="space-y-2">
          {["checking_account", "bills_account", "spanish_fork"].map((acct) => {
            const income = incomeByAccount[acct] ?? 0;
            const expense = expenseByAccount[acct] ?? 0;
            if (income === 0 && expense === 0) return null;
            return (
              <div key={acct} className="flex items-center justify-between gap-2 py-1 border-b border-neutral-100 dark:border-neutral-800 last:border-0">
                <span className="text-sm font-medium text-neutral-800 dark:text-neutral-200">{accountLabel(acct)}</span>
                <div className="flex gap-4 text-xs tabular-nums">
                  {income > 0 && <span className="text-emerald-600 dark:text-emerald-400">+{formatCurrency(income)}</span>}
                  {expense > 0 && <span className="text-red-600 dark:text-red-400">-{formatCurrency(expense)}</span>}
                  <span className="text-neutral-700 dark:text-neutral-300 font-medium">
                    Net: {formatCurrency(income - expense)}
                  </span>
                </div>
              </div>
            );
          })}
          {totalTransfers > 0 && (
            <div className="flex items-center justify-between gap-2 py-1 text-xs">
              <span className="text-neutral-500 dark:text-neutral-400">Auto transfers</span>
              <span className="text-sky-600 dark:text-sky-400 tabular-nums">{formatCurrency(totalTransfers)}</span>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
