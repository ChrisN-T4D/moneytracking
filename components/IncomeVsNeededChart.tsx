"use client";

import { formatCurrency } from "@/lib/format";

/** Per-account data for the runway bar: balance, required until next inflow, next inflow amount (e.g. next paycheck or next transfer). */
export interface RunwayAccount {
  balance: number;
  required: number;
  nextInflow: number;
}

export interface RunwayByAccount {
  checking: RunwayAccount;
  bills: RunwayAccount;
  spanishFork: RunwayAccount;
}

function formatDateShort(d: Date): string {
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

function formatDateStrShort(dateStr: string): string {
  if (!dateStr || dateStr.length < 10) return dateStr;
  const [y, m, d] = dateStr.split("-").map(Number);
  if (Number.isNaN(y) || Number.isNaN(m) || Number.isNaN(d)) return dateStr;
  return new Date(y, m - 1, d).toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

function parseYYYYMMDD(dateStr: string): Date | null {
  if (!dateStr || dateStr.length < 10) return null;
  const [y, m, d] = dateStr.split("-").map(Number);
  if (Number.isNaN(y) || Number.isNaN(m) || Number.isNaN(d)) return null;
  return new Date(y, m - 1, d);
}

function daysBetween(start: Date, end: Date): number {
  const a = new Date(start.getFullYear(), start.getMonth(), start.getDate());
  const b = new Date(end.getFullYear(), end.getMonth(), end.getDate());
  return Math.round((b.getTime() - a.getTime()) / (24 * 60 * 60 * 1000));
}

function truncateLabel(name: string, maxLen: number = 16): string {
  if (!name || name.length <= maxLen) return name;
  return name.slice(0, maxLen).trim() + "…";
}

/** Assign row indices so labels don't overlap (each label has a center pct; we use ~12% width). Returns row for each item in same order as input. */
function assignLabelRows<T extends { pct: number }>(
  items: T[],
  halfWidthPct: number = 6
): (T & { row: number })[] {
  const sorted = [...items].map((item, index) => ({ ...item, index })).sort((a, b) => a.pct - b.pct);
  const rightEdgeByRow: number[] = [];
  const rowByIndex: number[] = [];
  for (const item of sorted) {
    const left = item.pct - halfWidthPct;
    let row = 0;
    while (row < rightEdgeByRow.length && rightEdgeByRow[row] > left) row++;
    if (row === rightEdgeByRow.length) rightEdgeByRow.push(-999);
    rowByIndex[item.index] = row;
    rightEdgeByRow[row] = item.pct + halfWidthPct;
  }
  return items.map((item, index) => ({ ...item, row: rowByIndex[index] }));
}

interface IncomeVsNeededChartProps {
  /** Three-account runway: balance, required until next inflow, next inflow (yellow) per account */
  runway?: RunwayByAccount | null;
  /** Month-level extra (income - obligations); used for "Extra (month)" line */
  leftOver: number;
  /** Extra per paycheck = leftOver / payDates.length; fallback when extraThisPaycheck not set */
  leftoverPerPaycheck?: number;
  /** Extra this paycheck = next paycheck − auto transfers − bills (checking) − goals − variable; when set, shown as "Extra this paycheck" */
  extraThisPaycheck?: number;
  /** Current month name e.g. "March" */
  currentMonthName?: string;
  /** Budget per paycheck for Groceries & Gas (e.g. 250); shown in leftover line */
  groceriesBudgetPerPaycheck?: number;
  /** Optional: actual income received so far for next month (for small "Next month" note) */
  incomeNextMonth?: number;
  projectedNextMonth?: number;
  nextMonthName?: string;
  /** Today's date for current-date marker */
  todayDate?: Date | null;
  /** Upcoming bill due dates (this paycheck) */
  upcomingBills?: { date: string; name: string; amount: number; account?: string }[];
  /** Next paycheck date (for Checking bar label) */
  nextPaycheckDate?: Date | null;
  /** Next auto-transfer in to Bills (for bar label) */
  nextBillsInflowDate?: Date | null;
  /** Next auto-transfer in to Spanish Fork (for bar label) */
  nextSpanishForkInflowDate?: Date | null;
}

/**
 * Income vs Needed: three bars (Checking, Bills, Spanish Fork) showing runway (green) and next inflow (yellow),
 * plus "Extra per paycheck" leftover line. Month-level extra uses only recorded variable expenses.
 */
export function IncomeVsNeededChart({
  runway,
  leftOver,
  leftoverPerPaycheck,
  extraThisPaycheck,
  currentMonthName,
  groceriesBudgetPerPaycheck = 250,
  incomeNextMonth,
  projectedNextMonth,
  nextMonthName,
  todayDate,
  upcomingBills = [],
  nextPaycheckDate,
  nextBillsInflowDate,
  nextSpanishForkInflowDate,
}: IncomeVsNeededChartProps) {
  const showRunway = runway != null;
  const hasSurplus = leftOver >= 0;
  const displayExtra = extraThisPaycheck ?? leftoverPerPaycheck ?? (leftOver >= 0 ? leftOver : 0);
  const usePaycheckFormula = extraThisPaycheck !== undefined && extraThisPaycheck !== null;
  const flexiblePerPaycheck = Math.max(0, displayExtra - (groceriesBudgetPerPaycheck ?? 0));

  const nextInflowDateByKey = {
    checking: nextPaycheckDate,
    bills: nextBillsInflowDate,
    spanishFork: nextSpanishForkInflowDate,
  };

  const todayNorm = todayDate ? new Date(todayDate.getFullYear(), todayDate.getMonth(), todayDate.getDate()) : null;
  const defaultEndDays = 14;
  const useTimeScale = showRunway && todayNorm != null;

  // Same timeline for all three bars: today → next paycheck (so Bills/SF match Checking and can show auto-transfer mark)
  const commonEndDate = nextPaycheckDate
    ? new Date(nextPaycheckDate.getFullYear(), nextPaycheckDate.getMonth(), nextPaycheckDate.getDate())
    : todayNorm
      ? new Date(todayNorm.getTime() + defaultEndDays * 24 * 60 * 60 * 1000)
      : null;
  const totalDaysCommon = todayNorm && commonEndDate ? Math.max(1, daysBetween(todayNorm, commonEndDate)) : 1;

  return (
    <div className="mt-4 rounded-lg bg-neutral-100/80 dark:bg-neutral-800/50 px-3 py-3">
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-xs font-medium text-neutral-500 dark:text-neutral-400 uppercase tracking-wide">
          Income vs needed
        </h3>
        {todayDate && (
          <span className="text-[10px] font-medium text-neutral-500 dark:text-neutral-400 bg-neutral-200 dark:bg-neutral-700 px-1.5 py-0.5 rounded">
            Today: {formatDateShort(todayDate)}
          </span>
        )}
      </div>

      {useTimeScale ? (
        <>
          {/* Three bars: time-scaled (today on left, upcoming dates along bar, next inflow on right) */}
          {(["checking", "bills", "spanishFork"] as const).map((key) => {
            const acc = runway[key];
            const label = key === "checking" ? "Checking" : key === "bills" ? "Bills" : "Spanish Fork";
            const nextInflowDate = nextInflowDateByKey[key];
            const endDate = commonEndDate ?? todayNorm!;
            const totalDays = totalDaysCommon;
            const isEnough = acc.balance >= acc.required;
            const runwayDays =
              acc.required <= 0 ? totalDays : Math.min(totalDays, (acc.balance / acc.required) * totalDays);
            const greenPct = (runwayDays / totalDays) * 100;
            const redPct = isEnough ? 0 : 100 - greenPct;

            // Bills for this account (by account: checking_account → Checking, bills_account → Bills, spanish_fork → Spanish Fork)
            const accountFilter =
              key === "checking"
                ? (b: { account?: string }) => b.account === "checking_account"
                : key === "bills"
                  ? (b: { account?: string }) => b.account === "bills_account"
                  : (b: { account?: string }) => b.account === "spanish_fork";
            const billsForBar = upcomingBills
              .filter(accountFilter)
              .map((b) => ({
                date: parseYYYYMMDD(b.date),
                dateLabel: formatDateStrShort(b.date),
                name: b.name,
                amount: b.amount,
              }))
              .filter((x): x is { date: Date; dateLabel: string; name: string; amount: number } => x.date != null && x.date >= todayNorm && x.date <= endDate)
              .sort((a, b) => a.date.getTime() - b.date.getTime());

            // Next auto-transfer mark for Bills and Spanish Fork (on same timeline as Checking; mark where transfer lands)
            const nextTransferDate =
              key === "bills" ? nextBillsInflowDate : key === "spanishFork" ? nextSpanishForkInflowDate : null;
            const nextTransferNorm =
              nextTransferDate && todayNorm && nextTransferDate < endDate
                ? new Date(nextTransferDate.getFullYear(), nextTransferDate.getMonth(), nextTransferDate.getDate())
                : null;
            const nextTransferPct =
              nextTransferNorm && nextTransferNorm >= todayNorm
                ? Math.min(99, Math.max(1, (daysBetween(todayNorm, nextTransferNorm) / totalDays) * 100))
                : null;

            // Combined list for numbering: auto transfer (Bills/SF only) + bills, sorted by date. Numbers on bar refer to this list.
            type TimelineEntry = { type: "auto"; date: Date; dateLabel: string; name: string; amount: number } | { type: "bill"; date: Date; dateLabel: string; name: string; amount: number };
            const timelineItems: TimelineEntry[] = [];
            if ((key === "bills" || key === "spanishFork") && nextTransferNorm) {
              timelineItems.push({
                type: "auto",
                date: nextTransferNorm,
                dateLabel: formatDateShort(nextTransferNorm),
                name: "Auto transfer",
                amount: acc.nextInflow ?? 0,
              });
            }
            billsForBar.forEach((b) => timelineItems.push({ type: "bill", ...b }));
            timelineItems.sort((a, b) => a.date.getTime() - b.date.getTime());

            return (
              <div key={key} className="mb-4">
                <div className="flex justify-between text-xs mb-0.5">
                  <span className="text-neutral-600 dark:text-neutral-400 font-medium">{label}</span>
                  <span className="tabular-nums text-neutral-800 dark:text-neutral-200">
                    {formatCurrency(acc.balance)} now
                    {acc.nextInflow > 0 && (
                      <span className="ml-1 text-neutral-500 dark:text-neutral-400">
                        · Next: {formatCurrency(acc.nextInflow)}
                        {nextInflowDate && ` on ${formatDateShort(nextInflowDate)}`}
                      </span>
                    )}
                  </span>
                </div>
                <div className="relative">
                  {/* Today date above the bar; day-of-month every 7 days until next paycheck */}
                  <div className="relative flex items-center justify-between mb-0.5 min-h-[1.25rem]">
                    <span className="text-[10px] font-semibold text-neutral-700 dark:text-neutral-200 tabular-nums z-10">
                      Today {formatDateShort(todayNorm)}
                    </span>
                    {(() => {
                      const step = 7;
                      const marks: { pct: number; label: string }[] = [];
                      for (let d = step; d < totalDays; d += step) {
                        const markDate = new Date(todayNorm.getTime() + d * 24 * 60 * 60 * 1000);
                        const pct = (d / totalDays) * 100;
                        marks.push({ pct, label: formatDateShort(markDate) });
                      }
                      return marks.map((m, i) => (
                        <span
                          key={i}
                          className="absolute text-[10px] tabular-nums text-neutral-500 dark:text-neutral-400 -translate-x-1/2"
                          style={{ left: `${m.pct}%` }}
                        >
                          {m.label}
                        </span>
                      ));
                    })()}
                  </div>
                  {/* Timeline bar */}
                  <div className="h-2 w-full rounded-sm overflow-hidden flex flex-nowrap">
                    <div
                      className={`h-full shrink-0 ${isEnough ? "bg-emerald-500 dark:bg-emerald-600" : "bg-red-500 dark:bg-red-600"}`}
                      style={{ width: `${greenPct}%` }}
                      title={isEnough ? "Enough until next inflow" : "Runway (time covered by balance)"}
                    />
                    {redPct > 0 && (
                      <div
                        className="h-full shrink-0 bg-red-400 dark:bg-red-500"
                        style={{ width: `${redPct}%` }}
                        title="Shortfall until next inflow"
                      />
                    )}
                  </div>
                  {/* Axis line + ticks: one per timeline item (auto + bills), right under the bar */}
                  <div className="relative border-t border-neutral-400 dark:border-neutral-500 h-2">
                    {timelineItems.map((item, i) => {
                      const daysFromStart = daysBetween(todayNorm, item.date);
                      const pct = Math.min(99, Math.max(1, (daysFromStart / totalDays) * 100));
                      const isAuto = item.type === "auto";
                      return (
                        <span
                          key={i}
                          className={`absolute top-0 -translate-x-1/2 w-px h-2 ${isAuto ? "bg-violet-600 dark:bg-violet-500" : "bg-amber-600 dark:bg-amber-500"}`}
                          style={{ left: `${pct}%` }}
                          title={`${i + 1}. ${item.dateLabel} · ${item.name} ${formatCurrency(item.amount)}`}
                        />
                      );
                    })}
                  </div>
                  {/* Labels row: numbered circles (1, 2, 3 …) only — Today is above the bar */}
                  {(() => {
                    const labelItems = timelineItems.map((item, i) => {
                      const daysFromStart = daysBetween(todayNorm, item.date);
                      const pct = Math.min(99, Math.max(1, (daysFromStart / totalDays) * 100));
                      return { pct, type: "numbered" as const, index: i };
                    });
                    const withRows = assignLabelRows(labelItems, 4);
                    const maxRow = withRows.length ? Math.max(...withRows.map((x) => x.row)) : 0;
                    const rowHeightRem = 1.1;
                    return (
                      <div
                        className="relative mt-3 min-h-[2rem]"
                        style={{ minHeight: `${2 + maxRow * rowHeightRem}rem` }}
                      >
                        {withRows.map((item) => {
                          const entry = timelineItems[item.index];
                          const isAuto = entry?.type === "auto";
                          return (
                            <div
                              key={`num-${item.index}`}
                              className={`absolute -translate-x-1/2 z-10 flex items-center justify-center w-5 h-5 rounded-full text-[10px] font-bold tabular-nums ${
                                isAuto ? "bg-violet-500 dark:bg-violet-600 text-violet-950 dark:text-violet-100" : "bg-amber-500 dark:bg-amber-600 text-amber-950 dark:text-amber-100"
                              }`}
                              style={{
                                left: `${item.pct}%`,
                                bottom: `${item.row * rowHeightRem}rem`,
                              }}
                              title={`${item.index + 1}. ${entry?.dateLabel} · ${entry?.name} ${formatCurrency(entry?.amount ?? 0)}`}
                            >
                              {item.index + 1}
                            </div>
                          );
                        })}
                      </div>
                    );
                  })()}
                  {/* Numbered table: auto transfer + bills in order (number shown for each row) */}
                  {timelineItems.length > 0 && (
                    <div className="mt-2 rounded border border-neutral-200 dark:border-neutral-600 px-2 py-1.5">
                      <p className="text-[10px] font-medium text-neutral-500 dark:text-neutral-400 uppercase tracking-wide mb-1">
                        This paycheck ({label})
                      </p>
                      <ul className="space-y-0.5 text-xs text-neutral-700 dark:text-neutral-300">
                        {timelineItems.map((item, i) => (
                          <li key={i} className="flex justify-between gap-2 items-baseline">
                            <span className="flex items-baseline gap-1.5">
                              <span className="inline-flex items-center justify-center min-w-[1.25rem] h-5 rounded-full bg-neutral-200 dark:bg-neutral-600 text-neutral-800 dark:text-neutral-200 text-[10px] font-bold tabular-nums">
                                {i + 1}
                              </span>
                              <span className="tabular-nums text-neutral-500 dark:text-neutral-400">{item.dateLabel}</span>
                              <span>{item.name}</span>
                            </span>
                            <span className="tabular-nums shrink-0">{formatCurrency(item.amount)}</span>
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}
                </div>
                <p className="text-[10px] text-neutral-500 dark:text-neutral-400 mt-0.5">
                  {isEnough ? "Enough until next inflow" : `Short by ${formatCurrency(acc.required - acc.balance)}`}
                  {" · Bar = today → next paycheck " + formatDateShort(endDate)}
                </p>
              </div>
            );
          })}

          {/* Extra this paycheck (or fallback: month extra ÷ paychecks) */}
          <div className="mt-3 rounded-md px-2.5 py-1.5 bg-sky-100 dark:bg-sky-900/40 text-sky-800 dark:text-sky-200">
            <p className="text-sm font-medium">
              Extra this paycheck: <span className="font-bold tabular-nums">{formatCurrency(displayExtra)}</span>
              {groceriesBudgetPerPaycheck != null && groceriesBudgetPerPaycheck > 0 && (
                <span className="ml-1 text-sky-700 dark:text-sky-300">
                  (${groceriesBudgetPerPaycheck} Groceries &amp; Gas, {formatCurrency(flexiblePerPaycheck)} flexible)
                </span>
              )}
            </p>
            <p className="text-xs mt-0.5 text-sky-700 dark:text-sky-300">
              {usePaycheckFormula
                ? "Next paycheck − auto transfers − bills (checking) − goals − variable"
                : `${currentMonthName ?? "This month"} total extra: ${formatCurrency(leftOver)} (÷ 2 paychecks)`}
            </p>
          </div>

          {/* Optional: next month income one-liner */}
          {(nextMonthName != null || (projectedNextMonth != null && projectedNextMonth > 0)) && (
            <p className="text-xs text-neutral-500 dark:text-neutral-400 mt-2">
              {nextMonthName ?? "Next month"} income: {formatCurrency(incomeNextMonth ?? 0)}
              {projectedNextMonth != null && projectedNextMonth > 0 && (
                <span className="ml-1">(projected {formatCurrency(projectedNextMonth)})</span>
              )}
            </p>
          )}
        </>
      ) : showRunway ? (
        /* Fallback: dollar-scaled bars when todayDate not available */
        <>
          {(["checking", "bills", "spanishFork"] as const).map((key) => {
            const acc = runway![key];
            const label = key === "checking" ? "Checking" : key === "bills" ? "Bills" : "Spanish Fork";
            const nextDate = nextInflowDateByKey[key];
            const total = acc.required + acc.nextInflow || 1;
            const greenPct = (Math.min(acc.balance, acc.required) / total) * 100;
            const redPct = total ? (Math.max(0, acc.required - acc.balance) / total) * 100 : 0;
            const yellowPct = total ? (acc.nextInflow / total) * 100 : 0;
            const isEnough = acc.balance >= acc.required;
            return (
              <div key={key} className="mb-3">
                <div className="flex justify-between text-xs mb-0.5">
                  <span className="text-neutral-600 dark:text-neutral-400 font-medium">{label}</span>
                  <span className="tabular-nums text-neutral-800 dark:text-neutral-200">
                    {formatCurrency(acc.balance)} now
                    {acc.nextInflow > 0 && nextDate && (
                      <span className="ml-1 text-neutral-500 dark:text-neutral-400">
                        · Next: {formatCurrency(acc.nextInflow)} on {formatDateShort(nextDate)}
                      </span>
                    )}
                  </span>
                </div>
                <div className="h-2.5 w-full rounded-lg bg-neutral-200 dark:bg-neutral-700 overflow-hidden flex flex-nowrap">
                  <div
                    className={`h-full shrink-0 ${isEnough ? "bg-emerald-500 dark:bg-emerald-600" : "bg-red-500 dark:bg-red-600"}`}
                    style={{ width: `${greenPct}%` }}
                  />
                  {redPct > 0 && <div className="h-full shrink-0 bg-red-400 dark:bg-red-500" style={{ width: `${redPct}%` }} />}
                  {yellowPct > 0 && <div className="h-full shrink-0 bg-amber-400 dark:bg-amber-500" style={{ width: `${yellowPct}%` }} />}
                </div>
                <p className="text-[10px] text-neutral-500 dark:text-neutral-400 mt-0.5">
                  {isEnough ? "Enough until next inflow" : `Short by ${formatCurrency(acc.required - acc.balance)}`}
                </p>
              </div>
            );
          })}
          <div className="mt-3 rounded-md px-2.5 py-1.5 bg-sky-100 dark:bg-sky-900/40 text-sky-800 dark:text-sky-200">
            <p className="text-sm font-medium">
              Extra this paycheck: <span className="font-bold tabular-nums">{formatCurrency(displayExtra)}</span>
              {groceriesBudgetPerPaycheck != null && groceriesBudgetPerPaycheck > 0 && (
                <span className="ml-1 text-sky-700 dark:text-sky-300">
                  (${groceriesBudgetPerPaycheck} Groceries &amp; Gas, {formatCurrency(flexiblePerPaycheck)} flexible)
                </span>
              )}
            </p>
            <p className="text-xs mt-0.5 text-sky-700 dark:text-sky-300">
              {usePaycheckFormula
                ? "Next paycheck − auto transfers − bills (checking) − goals − variable"
                : `${currentMonthName ?? "This month"} total extra: ${formatCurrency(leftOver)} (÷ 2 paychecks)`}
            </p>
          </div>
          {(nextMonthName != null || (projectedNextMonth != null && projectedNextMonth > 0)) && (
            <p className="text-xs text-neutral-500 dark:text-neutral-400 mt-2">
              {nextMonthName ?? "Next month"} income: {formatCurrency(incomeNextMonth ?? 0)}
              {projectedNextMonth != null && projectedNextMonth > 0 && (
                <span className="ml-1">(projected {formatCurrency(projectedNextMonth)})</span>
              )}
            </p>
          )}
        </>
      ) : (
        /* Fallback when no runway data: simple month extra line */
        <div
          className={`flex justify-between items-baseline rounded-md px-2.5 py-1.5 ${
            hasSurplus
              ? "bg-emerald-100 dark:bg-emerald-900/40 text-emerald-800 dark:text-emerald-200"
              : "bg-red-100 dark:bg-red-900/40 text-red-800 dark:text-red-200"
          }`}
        >
          <span className="text-sm font-medium">
            {hasSurplus ? "Extra" : "Short"} ({currentMonthName ?? "this month"})
          </span>
          <span className="text-lg font-bold tabular-nums">{formatCurrency(leftOver)}</span>
        </div>
      )}
    </div>
  );
}
