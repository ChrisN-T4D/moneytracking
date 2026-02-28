"use client";

import { useState, useEffect, Fragment } from "react";
import { createPortal } from "react-dom";
import { formatCurrency } from "@/lib/format";
import { formatDateNoYear } from "@/lib/paycheckDates";
import type { MoneyStatusWithExtras, AutoTransferOccurrence } from "@/lib/summaryCalculations";
import type { AutoTransfer } from "@/lib/types";
import { getCardClasses, getSectionLabelClasses } from "@/lib/themePalettes";
import { useTheme } from "./ThemeProvider";
import { useGoals } from "./GoalsContext";
import { IncomeVsNeededChart, type RunwayByAccount } from "./IncomeVsNeededChart";

interface SummaryCardProps {
  moneyStatus: MoneyStatusWithExtras;
}

type AccountKey = "checking" | "bills" | "spanishFork";

const ACCOUNT_LABELS: Record<AccountKey, string> = {
  checking: "Checking",
  bills: "Bills acct",
  spanishFork: "Spanish Fork",
};

export function SummaryCard({ moneyStatus }: SummaryCardProps) {
  const { theme } = useTheme();
  const {
    forMonthName,
    paychecksThisMonth,
    payDates,
    predictedNeed,
    autoTransfersIn,
    accountBalances,
    paidThisMonth,
    leftOverComputed,
    variableExpensesThisMonth = 0,
    variableExpensesBreakdown = [],
    incomeNextMonth,
    nextMonthName,
    projectedNextMonth,
    incomeForDisplayMonth,
    actualPaychecksDisplayMonth = 0,
    displayMonthYearMonth,
    variableExpensesThisPaycheck = 0,
    requiredThisPaycheckByAccount,
    paidLastMonthByAccount,
    autoTransferredInSoFar,
    tableMode = "current_upcoming",
    leftMonthName,
    rightMonthName,
    autoInForLeftMonth,
    autoInForRightMonth,
    paycheckBreakdown,
    paychecksReceivedToDate = 0,
    groceriesAndGasSpentToDate = 0,
    variableExpensesToDate = 0,
    leftoverPerPaycheck,
    extraThisPaycheck,
    nextPaycheckAmount = 0,
    nextBillsInflow,
    nextSpanishForkInflow,
    todayDate,
    upcomingBills = [],
    autoTransfers = [],
    transferredThisCycleBonus,
  } = moneyStatus;
  const incomeUsedForLeftOver = incomeForDisplayMonth ?? paychecksThisMonth;
  const leftOverProjected = leftOverComputed + (paychecksThisMonth - incomeUsedForLeftOver);
  // Use context so goal contribution changes reflect instantly (no server round-trip needed)
  const { totalMonthlyContributions: totalGoalContributions } = useGoals();

  const [variableExpensesModalOpen, setVariableExpensesModalOpen] = useState(false);
  const [expandedAutoInKey, setExpandedAutoInKey] = useState<string | null>(null);
  const [fetchedActual, setFetchedActual] = useState<number | null>(null);
  const [balances, setBalances] = useState<Record<AccountKey, number | null>>({
    checking: accountBalances.checking,
    bills: accountBalances.bills,
    spanishFork: accountBalances.spanishFork,
  });
  const [editing, setEditing] = useState<AccountKey | null>(null);
  const [editValue, setEditValue] = useState("");
  const [saving, setSaving] = useState(false);

  const projectedForMonth = incomeForDisplayMonth ?? paychecksThisMonth;
  useEffect(() => {
    if (actualPaychecksDisplayMonth !== 0 || projectedForMonth <= 0 || !displayMonthYearMonth) {
      setFetchedActual(null);
      return;
    }
    let cancelled = false;
    fetch(`/api/actual-paychecks?month=${encodeURIComponent(displayMonthYearMonth)}`)
      .then((r) => r.json())
      .then((data) => {
        if (!cancelled && data?.ok === true && typeof data.actual === "number") setFetchedActual(data.actual);
      })
      .catch(() => {});
    return () => { cancelled = true; };
  }, [actualPaychecksDisplayMonth, projectedForMonth, displayMonthYearMonth]);

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

  // Running-balance "current" (to-date): schedule-based auto in + transferred-this-cycle bonus − paid
  const computedCurrentByKey: Record<AccountKey, number> = {
    checking:
      paychecksReceivedToDate
      - (autoTransferredInSoFar?.outFromChecking ?? 0)
      - paidThisMonth.checking
      - variableExpensesToDate
      - groceriesAndGasSpentToDate,
    bills:
      (autoTransferredInSoFar?.bills ?? 0) + (transferredThisCycleBonus?.bills ?? 0) - paidThisMonth.bills,
    spanishFork:
      (autoTransferredInSoFar?.spanishFork ?? 0) + (transferredThisCycleBonus?.spanishFork ?? 0) - paidThisMonth.spanishFork,
  };

  const reqPaycheckByKey: Record<AccountKey, number> = requiredThisPaycheckByAccount
    ? { checking: requiredThisPaycheckByAccount.checkingAccount, bills: requiredThisPaycheckByAccount.billsAccount, spanishFork: requiredThisPaycheckByAccount.spanishFork }
    : { checking: 0, bills: 0, spanishFork: 0 };

  const runway: RunwayByAccount = {
    checking: {
      balance: balances.checking ?? computedCurrentByKey.checking,
      required: reqPaycheckByKey.checking,
      nextInflow: nextPaycheckAmount ?? 0,
    },
    bills: {
      balance: balances.bills ?? computedCurrentByKey.bills,
      required: reqPaycheckByKey.bills,
      nextInflow: nextBillsInflow?.amount ?? 0,
    },
    spanishFork: {
      balance: balances.spanishFork ?? computedCurrentByKey.spanishFork,
      required: reqPaycheckByKey.spanishFork,
      nextInflow: nextSpanishForkInflow?.amount ?? 0,
    },
  };

  const paidLastMonthByKey: Record<AccountKey, number> = paidLastMonthByAccount
    ? { checking: paidLastMonthByAccount.checking, bills: paidLastMonthByAccount.bills, spanishFork: paidLastMonthByAccount.spanishFork }
    : { checking: 0, bills: 0, spanishFork: 0 };
  // Bills and Spanish Fork show money that ARRIVED in those accounts.
  // Checking shows $0 auto-in (paychecks come in as income, not auto-transfers).
  // Personal/fun-money transfers are outflows FROM checking — tracked in details with direction "out".
  const autoInSoFarByKey: Record<AccountKey, number> = autoTransferredInSoFar
    ? { checking: 0, bills: autoTransferredInSoFar.bills, spanishFork: autoTransferredInSoFar.spanishFork }
    : { checking: 0, bills: 0, spanishFork: 0 };

  function isSpanishForkDetail(d: AutoTransferOccurrence): boolean {
    const a = d.account.trim().toLowerCase();
    const w = d.whatFor.trim().toLowerCase();
    return a.includes("spanish") || a === "spanish fork" || w.includes("spanish fork");
  }
  const autoInDetailsByKey: Record<AccountKey, AutoTransferOccurrence[]> = {
    bills: (autoTransferredInSoFar?.details ?? []).filter((d) => d.direction === "in" && !isSpanishForkDetail(d) && (() => { const a = d.account.trim().toLowerCase(); return a.includes("bills") || a === "bills"; })()),
    spanishFork: (autoTransferredInSoFar?.details ?? []).filter((d) => d.direction === "in" && isSpanishForkDetail(d)),
    checking: (autoTransferredInSoFar?.details ?? []).filter((d) => d.direction === "out"),
  };
  const checkingAutoOut = autoTransferredInSoFar?.outFromChecking ?? 0;

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

      {/* Income vs Needed — three bars (Checking, Bills, Spanish Fork) + extra per paycheck */}
      <IncomeVsNeededChart
        runway={runway}
        leftOver={leftOverComputed}
        leftoverPerPaycheck={leftoverPerPaycheck}
        extraThisPaycheck={extraThisPaycheck}
        currentMonthName={forMonthName || undefined}
        groceriesBudgetPerPaycheck={paycheckBreakdown?.groceriesBudgetPerPaycheck ?? 250}
        incomeNextMonth={incomeNextMonth}
        projectedNextMonth={projectedNextMonth}
        nextMonthName={nextMonthName}
        todayDate={todayDate}
        upcomingBills={upcomingBills}
        nextPaycheckDate={moneyStatus.nextPaycheckDate}
        nextBillsInflowDate={nextBillsInflow?.date}
        nextSpanishForkInflowDate={nextSpanishForkInflow?.date}
      />

      {/* Auto transfers this cycle: done vs not yet (for switching projected → completed in chart) */}
      {autoTransfers.length > 0 && (
        <div className="mt-3 rounded-lg bg-neutral-100/80 dark:bg-neutral-800/50 px-3 py-2">
          <p className="text-[10px] font-medium text-neutral-500 dark:text-neutral-400 uppercase tracking-wide mb-1.5">
            Auto transfers this cycle
          </p>
          <ul className="space-y-1">
            {autoTransfers.map((t: AutoTransfer) => (
              <li key={t.id} className="flex justify-between items-center text-xs text-neutral-700 dark:text-neutral-300">
                <span>
                  {t.transferredThisCycle ? (
                    <span className="text-emerald-600 dark:text-emerald-400 font-medium" title="Transferred this paycheck/cycle">✓</span>
                  ) : (
                    <span className="text-neutral-400 dark:text-neutral-500" title="Not yet this cycle">—</span>
                  )}
                  <span className="ml-1.5">{t.whatFor}</span>
                  <span className="ml-1 text-neutral-500 dark:text-neutral-400">→ {(() => { const a = (t.account ?? "").toLowerCase(); return a.includes("bills") ? ACCOUNT_LABELS.bills : a.includes("spanish") ? ACCOUNT_LABELS.spanishFork : ACCOUNT_LABELS.checking; })()}</span>
                </span>
                <span className="tabular-nums">{formatCurrency(t.amount)}</span>
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* Per-account tables: vertical stack (Past & Current or Current & Coming up) */}
      <div className="mt-4 border-t border-neutral-200 dark:border-neutral-600 pt-4">
        <p className="text-[11px] text-neutral-500 dark:text-neutral-400 mb-3">
          Income deposits to Checking; auto transfers move money to Bills and Spanish Fork. Ensure each account has enough for this paycheck.
        </p>
        <div className="space-y-6">
          {[leftMonthName, rightMonthName].filter(Boolean).map((monthLabel, tableIndex) => {
            const isLeft = tableIndex === 0;
            const showInteractive = isLeft ? tableMode === "current_upcoming" : tableMode === "past_current";
            const periodLabel = tableMode === "past_current"
              ? (isLeft ? "Past" : "Current")
              : (isLeft ? "Current" : "Coming up");
            const autoForThisTable = (isLeft ? autoInForLeftMonth : autoInForRightMonth) ?? { bills: 0, spanishFork: 0, checking: 0, outFromChecking: 0, details: [] };
            const autoInSoFarByKeyThisTable: Record<AccountKey, number> = {
              checking: 0,
              bills: autoForThisTable.bills,
              spanishFork: autoForThisTable.spanishFork,
            };
            const autoInDetailsByKeyThisTable: Record<AccountKey, AutoTransferOccurrence[]> = {
              bills: (autoForThisTable.details ?? []).filter((d) => d.direction === "in" && !isSpanishForkDetail(d) && (() => { const a = d.account.trim().toLowerCase(); return a.includes("bills") || a === "bills"; })()),
              spanishFork: (autoForThisTable.details ?? []).filter((d) => d.direction === "in" && isSpanishForkDetail(d)),
              checking: (autoForThisTable.details ?? []).filter((d) => d.direction === "out"),
            };
            const checkingAutoOutThisTable = autoForThisTable.outFromChecking ?? 0;
            return (
              <div key={monthLabel}>
                <h3 className="text-sm font-semibold text-neutral-900 dark:text-white mb-1.5">
                  {periodLabel} — {monthLabel}
                </h3>
                <div className="overflow-x-auto">
                  <table className="w-full text-sm min-w-[32rem]">
                    <thead>
                      <tr className="text-xs text-neutral-500 dark:text-neutral-400 border-b border-neutral-200 dark:border-neutral-600">
                        <th className="text-left font-medium pb-1.5 pr-2">Account</th>
                        <th className="text-right font-medium pb-1.5">Req. month</th>
                        <th className="text-right font-medium pb-1.5">Req. paycheck</th>
                        <th className="text-right font-medium pb-1.5">Paid</th>
                        <th className="text-right font-medium pb-1.5 whitespace-nowrap">Auto in to date</th>
                        <th className="text-right font-medium pb-1.5 pl-2">Current in account</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-neutral-100 dark:divide-neutral-700/50">
                      {accountKeys.map((key) => {
                        const needed = predictedByKey[key];
                        const reqPaycheck = reqPaycheckByKey[key];
                        const paidLastMonth = paidLastMonthByKey[key];
                        const paidThisMonthVal = paidByKey[key] ?? 0;
                        const autoIn = autoInSoFarByKeyThisTable[key];
                        const stored = balances[key];
                        const computed = computedCurrentByKey[key];
                        const current = stored ?? computed;
                        const enoughForPaycheck = reqPaycheck <= 0 || current + autoIn >= reqPaycheck;
                        const diffColor = enoughForPaycheck ? "text-emerald-600 dark:text-emerald-400" : "text-red-600 dark:text-red-400";
                        const isEditing = editing === key;
                        const autoDetails = autoInDetailsByKeyThisTable[key];
                        const hasAutoDetails = autoDetails.length > 0;
                        const autoDisplayValue = key === "checking" ? checkingAutoOutThisTable : autoIn;
                        const autoDisplayIsOut = key === "checking" && checkingAutoOutThisTable > 0;

                        const paid = isLeft ? (tableMode === "past_current" ? paidLastMonth : paidThisMonthVal) : (tableMode === "past_current" ? paidThisMonthVal : null);
                        const autoInVal = isLeft ? (tableMode === "current_upcoming" ? autoIn : (tableMode === "past_current" ? null : null)) : (tableMode === "past_current" ? autoIn : null);
                        const currentVal = isLeft ? (tableMode === "current_upcoming" ? current : (tableMode === "past_current" ? null : null)) : (tableMode === "past_current" ? current : null);

                        return (
                          <Fragment key={key}>
                            <tr>
                              <td className="py-2 font-medium text-neutral-700 dark:text-neutral-300 pr-2">{ACCOUNT_LABELS[key]}</td>
                              <td className="py-2 text-right tabular-nums text-neutral-600 dark:text-neutral-400">{formatCurrency(needed)}</td>
                              <td className="py-2 text-right tabular-nums text-neutral-600 dark:text-neutral-400">{formatCurrency(reqPaycheck)}</td>
                              <td className="py-2 text-right tabular-nums text-neutral-600 dark:text-neutral-400">{paid != null ? formatCurrency(paid) : "—"}</td>
                              <td className="py-2 text-right tabular-nums">
{hasAutoDetails ? (
                        <button type="button" onClick={() => setExpandedAutoInKey(expandedAutoInKey === `${monthLabel}|${key}` ? null : `${monthLabel}|${key}`)} className={`tabular-nums inline-flex items-center gap-1 hover:opacity-75 ${autoDisplayIsOut ? "text-red-600 dark:text-red-400" : "text-neutral-600 dark:text-neutral-400"}`} title="Click to see breakdown">
                                    {autoDisplayIsOut && <span className="text-[10px]">↓</span>}
                                    {formatCurrency(autoDisplayValue)}
                                    <svg className={`w-3 h-3 transition-transform ${expandedAutoInKey === `${monthLabel}|${key}` ? "rotate-180" : ""}`} viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round"><path d="M4 6l4 4 4-4"/></svg>
                                  </button>
                                ) : (autoDisplayValue > 0 || (key === "checking" && checkingAutoOutThisTable > 0)) ? (
                                  <span className={`tabular-nums ${autoDisplayIsOut ? "text-red-600 dark:text-red-400" : "text-neutral-600 dark:text-neutral-400"}`}>{autoDisplayIsOut && <span className="text-[10px] mr-0.5">↓</span>}{formatCurrency(autoDisplayValue)}</span>
                                ) : (
                                  <span className="tabular-nums text-neutral-600 dark:text-neutral-400">{autoInVal != null ? formatCurrency(autoInVal) : "—"}</span>
                                )}
                              </td>
                              <td className="py-2 pl-2 text-right">
                                {showInteractive && isEditing ? (
                                  <input autoFocus type="number" inputMode="decimal" value={editValue} onChange={(e) => setEditValue(e.target.value)} onBlur={() => void commitEdit(key)} onKeyDown={(e) => { if (e.key === "Enter") void commitEdit(key); if (e.key === "Escape") setEditing(null); }} className="w-24 rounded border border-sky-400 bg-white dark:bg-neutral-900 px-1.5 py-0.5 text-right text-sm tabular-nums text-neutral-900 dark:text-neutral-100 outline-none" />
                                ) : showInteractive ? (
                                  <button type="button" onClick={() => startEdit(key)} title="Tap to enter actual balance" className={`tabular-nums font-medium ${diffColor} underline-offset-2 hover:underline cursor-text`}>
                                    {formatCurrency(current)}{stored == null && <span className="ml-1 text-[10px] text-neutral-400 no-underline">(est)</span>}
                                  </button>
                                ) : (
                                  <span className="tabular-nums text-neutral-600 dark:text-neutral-400">{currentVal != null ? formatCurrency(currentVal) : "—"}</span>
                                )}
                              </td>
                            </tr>
                            {expandedAutoInKey === `${monthLabel}|${key}` && autoDetails.length > 0 && (
                              <tr>
                                <td colSpan={6} className="pb-2 pt-0">
                                  <div className="ml-2 rounded-md bg-neutral-50 dark:bg-neutral-800/60 border border-neutral-200 dark:border-neutral-700 px-3 py-2 text-xs space-y-1">
                                    {key === "checking" && (
                                      <p className="text-neutral-400 dark:text-neutral-500 mb-1 italic">Sent out from Checking (fun money / personal accounts)</p>
                                    )}
                                    {autoDetails.map((d, i) => (
                                      <div key={i} className="flex justify-between items-baseline gap-2">
                                        <span className="text-neutral-600 dark:text-neutral-400 truncate">
                                          {d.direction === "out" && <span className="mr-0.5 text-red-400">↓</span>}
                                          {d.whatFor || d.account}
                                          {d.account && d.whatFor && d.whatFor !== d.account && (
                                            <span className="ml-1 text-neutral-400">→ {d.account}</span>
                                          )}
                                          {d.count > 1 && <span className="ml-1 text-neutral-400">×{d.count}</span>}
                                          {d.dates.length > 0 && (
                                            <span className="ml-1 text-neutral-400">
                                              ({d.dates.map((dt) => dt.slice(5).replace("-", "/")).join(", ")})
                                            </span>
                                          )}
                                        </span>
                                        <span className={`tabular-nums font-medium shrink-0 ${d.direction === "out" ? "text-red-600 dark:text-red-400" : "text-neutral-700 dark:text-neutral-300"}`}>
                                          {d.direction === "out" ? "-" : ""}{formatCurrency(d.total)}
                                        </span>
                                      </div>
                                    ))}
                                    <div className="flex justify-between items-baseline border-t border-neutral-200 dark:border-neutral-600 pt-1 mt-1">
                                      <span className="text-neutral-500 dark:text-neutral-400 font-medium">
                                        {key === "checking" ? "Total out" : "Total in"}
                                      </span>
                                      <span className={`tabular-nums font-semibold ${key === "checking" ? "text-red-600 dark:text-red-400" : "text-neutral-800 dark:text-neutral-200"}`}>
                                        {key === "checking" ? "-" : ""}{formatCurrency(key === "checking" ? checkingAutoOutThisTable : autoIn)}
                                      </span>
                                    </div>
                                  </div>
                                </td>
                              </tr>
                            )}
                          </Fragment>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </div>
            );
          })}
        </div>
        {saving && <p className="text-xs text-neutral-400 mt-1 text-right">Saving…</p>}
        <p className="text-[11px] text-neutral-400 dark:text-neutral-500 mt-1.5">
          Tap Current in account to enter actual balance. Green = enough for this paycheck (current in account + auto in to date ≥ req. paycheck).
        </p>
      </div>

      {/* Next 2 weeks: Groceries & Gas + Variable (this paycheck) */}
      {moneyStatus.subsections && (
        <div className="mt-4 border-t border-neutral-200 dark:border-neutral-600 pt-4">
          <p className="text-xs font-medium text-neutral-500 dark:text-neutral-400 mb-2">Next 2 weeks (this paycheck)</p>
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
                <td className="py-2 font-medium text-neutral-700 dark:text-neutral-300">Groceries & Gas</td>
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
              <tr>
                <td className="py-2 font-medium text-neutral-700 dark:text-neutral-300">Variable expenses</td>
                <td className="py-2 text-right tabular-nums text-neutral-600 dark:text-neutral-400">—</td>
                <td className="py-2 pl-3 text-right tabular-nums text-neutral-600 dark:text-neutral-400">
                  {formatCurrency(variableExpensesThisPaycheck)}
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
