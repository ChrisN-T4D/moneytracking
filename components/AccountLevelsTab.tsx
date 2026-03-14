"use client";

import { useState } from "react";
import { formatCurrency } from "@/lib/format";
import type { MoneyStatusWithExtras } from "@/lib/summaryCalculations";
import { getCardClasses } from "@/lib/themePalettes";
import { useTheme } from "./ThemeProvider";
type AccountKey = "checking" | "bills" | "spanishFork";

const ACCOUNT_LABELS: Record<AccountKey, string> = {
  checking: "Joint Checking",
  bills: "Oklahoma Bills",
  spanishFork: "Spanish Fork",
};

export function AccountLevelsTab({ moneyStatus }: { moneyStatus: MoneyStatusWithExtras }) {
  const { theme } = useTheme();
  const {
    accountBalances,
    paychecksReceivedToDate = 0,
    autoTransferredInSoFar,
    paidThisMonth,
    variableExpensesToDate = 0,
    groceriesAndGasSpentToDate = 0,
    transferredThisCycleBonus,
    requiredThisPaycheckByAccount,
    nextPaycheckAmount = 0,
    nextBillsInflow,
    nextSpanishForkInflow,
    todayDate,
    upcomingBills = [],
    upcomingTransfersOutOfChecking = [],
    leftoverPerPaycheck,
    extraThisPaycheck,
    paycheckBreakdown,
    incomeNextMonth,
    projectedNextMonth,
    nextMonthName,
  } = moneyStatus;

  const [balances, setBalances] = useState<Record<AccountKey, number | null>>({
    checking: accountBalances.checking,
    bills: accountBalances.bills,
    spanishFork: accountBalances.spanishFork,
  });
  const [editing, setEditing] = useState<AccountKey | null>(null);
  const [editValue, setEditValue] = useState("");
  const [saving, setSaving] = useState(false);

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

  const accountKeys: AccountKey[] = ["checking", "bills", "spanishFork"];

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

  return (
    <div className="space-y-4">
      <div className={getCardClasses(theme.summary)}>
        <h2 className="text-sm font-semibold text-neutral-900 dark:text-white mb-3">
          Current account levels
        </h2>
        <p className="text-[11px] text-neutral-500 dark:text-neutral-400 mb-3">
          Tap balance to enter actual amount. Green = enough for this paycheck.
        </p>
        <div className="overflow-x-auto">
          <table className="w-full text-sm min-w-[280px]">
            <thead>
              <tr className="text-xs text-neutral-500 dark:text-neutral-400 border-b border-neutral-200 dark:border-neutral-600">
                <th className="text-left font-medium pb-1.5 pr-2">Account</th>
                <th className="text-right font-medium pb-1.5">Required</th>
                <th className="text-right font-medium pb-1.5 pl-2">Current</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-neutral-100 dark:divide-neutral-700/50">
              {accountKeys.map((key) => {
                const current = balances[key] ?? computedCurrentByKey[key];
                const reqPaycheck = reqPaycheckByKey[key];
                const enough = reqPaycheck <= 0 || current >= reqPaycheck;
                const isEditingKey = editing === key;
                return (
                  <tr key={key}>
                    <td className="py-2.5 font-medium text-neutral-700 dark:text-neutral-300 pr-2">
                      {ACCOUNT_LABELS[key]}
                    </td>
                    <td className="py-2.5 text-right tabular-nums text-neutral-600 dark:text-neutral-400">
                      {formatCurrency(reqPaycheck)}
                    </td>
                    <td className="py-2.5 pl-2 text-right">
                      {isEditingKey ? (
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
                          className={`tabular-nums font-medium underline-offset-2 hover:underline cursor-text ${
                            enough ? "text-emerald-600 dark:text-emerald-400" : "text-red-600 dark:text-red-400"
                          }`}
                        >
                          {formatCurrency(current)}
                          {balances[key] == null && (
                            <span className="ml-1 text-[10px] text-neutral-400 no-underline">(est)</span>
                          )}
                        </button>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        {saving && <p className="text-xs text-neutral-400 mt-1 text-right">Saving…</p>}
      </div>
    </div>
  );
}
