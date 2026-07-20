/**
 * Paycheck-window snapshot for the Analyze tab (numbers first; model narrates this JSON).
 */
import {
  getPaychecks,
  getBillsWithMeta,
  getAutoTransfers,
  getSpanishForkBills,
  getSummary,
  getStatements,
  getStatementTagRules,
} from "@/lib/pocketbase";
import { defaultPaycheckConfigs } from "@/lib/paycheckConfig";
import {
  formatDateToYYYYMMDD,
  getNextPaydayFromSchedule,
  daysUntil,
} from "@/lib/paycheckDates";
import {
  allPayDatesWithinMonthRadius,
  allPayDatesNearMonth,
  billIncludedForNeededBeforePaycheck,
  requiredThisPaycheckByAccountFromBills,
  collectTransfersLeavingCheckingInRange,
} from "@/lib/summaryCalculations";
import { billOccurrenceDatesInRange } from "@/lib/billOccurrenceDates";
import { effectivePaycheckAmount } from "@/lib/paycheckAmountOverride";
import { makeStatementPattern, suggestTagsForStatements } from "@/lib/statementTagging";
import { isTransferDescription } from "@/lib/statementsAnalysis";
import {
  recurringCycleKeyForExpense,
  isManualRecurringPaidForKey,
} from "@/lib/recurringPaidCycle";
import type { StatementRecord } from "@/lib/types";

export interface AnalyzeSnapshot {
  window: {
    todayYmd: string;
    nextPaydayYmd: string | null;
    nextPaydayLabel: string | null;
    daysUntilPayday: number | null;
  };
  accounts: {
    key: string;
    label: string;
    balance: number | null;
    plannedIn: number;
    plannedOut: number;
    projected: number | null;
    required: number;
  }[];
  paychecksNearWindow: { name: string; date: string; amount: number }[];
  largeUpcomingBills: {
    name: string;
    account: string;
    date: string;
    amount: number;
    isPaid: boolean;
  }[];
  spend: {
    thisCycleOutflow: number;
    priorCycleOutflow: number;
    topMerchants: { pattern: string; amount: number; count: number }[];
    byCategory: { label: string; amount: number }[];
  };
  recurringCandidates: {
    name: string;
    source: "subscription_bill" | "statement_pattern";
    amount: number;
    count: number;
    lastDate: string | null;
    monthlyEquivalent: number | null;
    frequency: string | null;
    /** True when next due falls in the paycheck window (actionable now). */
    dueInWindow: boolean;
  }[];
  /** Deterministic cash lines — UI renders these; model must not rewrite Cash picture $. */
  cashPictureLines: string[];
  dataNotes: string[];
}

function ymdAddDays(ymd: string, days: number): string {
  const [y, m, d] = ymd.split("-").map(Number);
  const dt = new Date(y!, m! - 1, d!);
  dt.setDate(dt.getDate() + days);
  return formatDateToYYYYMMDD(dt);
}

function statementDayYmd(s: StatementRecord): string | null {
  const raw = (s.date ?? "").trim();
  if (!raw) return null;
  const part = raw.includes("T") ? raw.split("T")[0]! : raw.slice(0, 10);
  if (/^\d{4}-\d{2}-\d{2}$/.test(part)) return part;
  const d = new Date(raw);
  if (Number.isNaN(d.getTime())) return null;
  return formatDateToYYYYMMDD(d);
}

function absOutflow(amount: number): number {
  return Math.abs(amount);
}

/** Tagged / heuristic spend outflow in [startYmd, endYmd] inclusive (excludes transfers & income). */
function spendOutflowInRange(
  statements: StatementRecord[],
  rules: Awaited<ReturnType<typeof getStatementTagRules>>,
  startYmd: string,
  endYmd: string
): {
  total: number;
  byCategory: Map<string, number>;
  merchants: Map<string, { amount: number; count: number }>;
} {
  const inRange = statements.filter((s) => {
    const ymd = statementDayYmd(s);
    if (!ymd || ymd < startYmd || ymd > endYmd) return false;
    if (isTransferDescription(s.description ?? "")) return false;
    if (s.amount > 0) return false;
    return true;
  });
  const suggestions = suggestTagsForStatements(inRange, rules);
  const byCategory = new Map<string, number>();
  const merchants = new Map<string, { amount: number; count: number }>();
  let total = 0;

  for (const sug of suggestions) {
    const amt = absOutflow(sug.statement.amount);
    total += amt;
    const label =
      sug.targetType === "ignore"
        ? "Untagged"
        : sug.targetType === "variable_expense"
          ? "Variable expenses"
          : sug.targetType === "subscription"
            ? `Sub: ${sug.targetName || "unknown"}`
            : sug.targetType === "bill"
              ? `Bill: ${sug.targetName || "unknown"}`
              : sug.targetType === "spanish_fork"
                ? `SF: ${sug.targetName || "unknown"}`
                : sug.targetType === "income"
                  ? "Income"
                  : sug.targetType === "auto_transfer"
                    ? "Transfer"
                    : sug.targetName || sug.targetType;
    if (sug.targetType !== "income" && sug.targetType !== "auto_transfer") {
      byCategory.set(label, (byCategory.get(label) ?? 0) + amt);
    }
    const pattern = makeStatementPattern(sug.statement.description ?? "") || "UNKNOWN";
    const prev = merchants.get(pattern) ?? { amount: 0, count: 0 };
    merchants.set(pattern, { amount: prev.amount + amt, count: prev.count + 1 });
  }

  return { total, byCategory, merchants };
}

export async function buildAnalyzeSnapshot(now: Date = new Date()): Promise<AnalyzeSnapshot> {
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const todayYmd = formatDateToYYYYMMDD(today);
  const dataNotes: string[] = [];

  const [
    paycheckConfigs,
    billsWithMeta,
    autoTransfers,
    spanishForkBills,
    summary,
    statements,
    tagRules,
  ] = await Promise.all([
    getPaychecks(),
    getBillsWithMeta(),
    getAutoTransfers(),
    getSpanishForkBills(),
    getSummary(),
    getStatements({ perPage: 500, sort: "-date" }),
    getStatementTagRules(),
  ]);

  const configs = paycheckConfigs.length > 0 ? paycheckConfigs : defaultPaycheckConfigs;
  const scheduleDates = allPayDatesWithinMonthRadius(
    configs,
    today.getFullYear(),
    today.getMonth(),
    2
  );
  const nextPayday = getNextPaydayFromSchedule(today, scheduleDates);
  const nextPaydayYmd = nextPayday ? formatDateToYYYYMMDD(nextPayday) : null;
  const nextPaydayLabel = nextPayday
    ? nextPayday.toLocaleDateString("en-US", { month: "short", day: "numeric" })
    : null;
  const daysUntilPayday = nextPayday ? daysUntil(today, nextPayday) : null;

  if (!nextPaydayYmd) dataNotes.push("No next payday found in schedule; window is unbounded.");
  if (statements.length < 20) dataNotes.push("Few statements loaded — spend reality may be incomplete.");
  if (tagRules.length === 0) dataNotes.push("No statement tag rules — categorization will be thin.");

  const windowEnd = nextPaydayYmd ?? ymdAddDays(todayYmd, 14);
  const payDatesNear = allPayDatesNearMonth(configs, today.getFullYear(), today.getMonth());

  // Prior paycheck window: previous payday → day before today window start
  const sortedPayYmds = [...new Set(scheduleDates.map((d) => formatDateToYYYYMMDD(d)))].sort();
  const priorPaydayYmd =
    sortedPayYmds.filter((d) => d < todayYmd).pop() ?? ymdAddDays(todayYmd, -14);
  const priorStartYmd = priorPaydayYmd;
  const priorEndYmd = ymdAddDays(todayYmd, -1);

  const needed = requiredThisPaycheckByAccountFromBills(
    billsWithMeta,
    spanishForkBills,
    nextPaydayYmd,
    { referenceDate: today }
  );

  const windowEndDate = nextPayday ?? new Date(today.getFullYear(), today.getMonth(), today.getDate() + 14);
  const transfersOut = collectTransfersLeavingCheckingInRange(
    autoTransfers,
    today,
    windowEndDate,
    { funMoney: true }
  );

  // Planned out from bills due in window (exclude manually marked paid)
  let billsOutChecking = 0;
  let billsOutBills = 0;
  let billsOutSf = 0;
  const largeUpcoming: AnalyzeSnapshot["largeUpcomingBills"] = [];

  for (const b of billsWithMeta) {
    if (!billIncludedForNeededBeforePaycheck(b, nextPaydayYmd, { referenceDate: today })) continue;
    const occs = nextPaydayYmd
      ? billOccurrenceDatesInRange(b, todayYmd, nextPaydayYmd)
      : b.nextDue
        ? [b.nextDue.slice(0, 10)]
        : [];
    for (const occ of occs) {
      const cycleKey = recurringCycleKeyForExpense(
        occ,
        b.frequency,
        today.getFullYear(),
        today.getMonth(),
        configs,
        payDatesNear
      );
      const isPaid = isManualRecurringPaidForKey(
        [{ recurringPaidCycle: b.recurringPaidCycle, recurringPaidGoalId: b.recurringPaidGoalId }],
        cycleKey,
        false
      );
      const amt = effectivePaycheckAmount(b, nextPaydayYmd);
      largeUpcoming.push({
        name: b.name,
        account: b.account ?? "checking_account",
        date: occ,
        amount: amt,
        isPaid,
      });
      if (!isPaid) {
        if (b.account === "bills_account") billsOutBills += amt;
        else billsOutChecking += amt;
      }
    }
  }

  for (const b of spanishForkBills) {
    if (!billIncludedForNeededBeforePaycheck(b, nextPaydayYmd, { referenceDate: today })) continue;
    const occs = nextPaydayYmd
      ? billOccurrenceDatesInRange(b, todayYmd, nextPaydayYmd)
      : b.nextDue
        ? [b.nextDue.slice(0, 10)]
        : [];
    for (const occ of occs) {
      const cycleKey = recurringCycleKeyForExpense(
        occ,
        b.frequency || "monthly",
        today.getFullYear(),
        today.getMonth(),
        configs,
        payDatesNear
      );
      const isPaid = isManualRecurringPaidForKey(
        [{ recurringPaidCycle: b.recurringPaidCycle, recurringPaidGoalId: b.recurringPaidGoalId }],
        cycleKey,
        false
      );
      const amt = effectivePaycheckAmount(b, nextPaydayYmd);
      largeUpcoming.push({
        name: b.name,
        account: "spanish_fork",
        date: occ,
        amount: amt,
        isPaid,
      });
      if (!isPaid) billsOutSf += amt;
    }
  }

  largeUpcoming.sort((a, b) => b.amount - a.amount);

  // Paychecks / planned in (checking) — single pass, dedupe name+date
  const paychecksNearWindow: AnalyzeSnapshot["paychecksNearWindow"] = [];
  let plannedInChecking = 0;
  const seenPay = new Set<string>();
  const monthsToScan =
    nextPayday && nextPayday.getMonth() !== today.getMonth()
      ? [
          { y: today.getFullYear(), m: today.getMonth() },
          { y: nextPayday.getFullYear(), m: nextPayday.getMonth() },
        ]
      : [{ y: today.getFullYear(), m: today.getMonth() }];
  for (const { y, m } of monthsToScan) {
    for (const c of configs) {
      for (const p of allPayDatesNearMonth([c], y, m)) {
        const ymd = formatDateToYYYYMMDD(p.date);
        if (ymd < todayYmd || ymd > windowEnd) continue;
        const key = `${c.name}|${ymd}`;
        if (seenPay.has(key)) continue;
        seenPay.add(key);
        paychecksNearWindow.push({ name: c.name, date: ymd, amount: p.amount });
        plannedInChecking += p.amount;
      }
    }
  }

  // Use total leaving checking for planned out on checking
  const checkingPlannedOut = billsOutChecking + transfersOut.total;

  // Transfers into bills/SF: details are money leaving checking; classify by name
  let transferInBills = 0;
  let transferInSf = 0;
  for (const d of transfersOut.details) {
    const n = (d.name ?? "").toLowerCase();
    if (n.includes("spanish")) transferInSf += d.amount;
    else if (n.includes("bill") || n.includes("eighth") || n.includes("way2save")) transferInBills += d.amount;
  }

  const checkingBal = summary?.checkingBalance ?? null;
  const billsBal = summary?.billsBalance ?? null;
  const sfBal = summary?.spanishForkBalance ?? null;

  const accounts: AnalyzeSnapshot["accounts"] = [
    {
      key: "checking",
      label: "Checking",
      balance: checkingBal,
      plannedIn: plannedInChecking,
      plannedOut: checkingPlannedOut,
      projected:
        checkingBal == null ? null : checkingBal + plannedInChecking - checkingPlannedOut,
      required: needed.checkingAccount,
    },
    {
      key: "bills",
      label: "Bills",
      balance: billsBal,
      plannedIn: transferInBills,
      plannedOut: billsOutBills,
      projected: billsBal == null ? null : billsBal + transferInBills - billsOutBills,
      required: needed.billsAccount,
    },
    {
      key: "spanish_fork",
      label: "Spanish Fork",
      balance: sfBal,
      plannedIn: transferInSf,
      plannedOut: billsOutSf,
      projected: sfBal == null ? null : sfBal + transferInSf - billsOutSf,
      required: needed.spanishFork,
    },
  ];

  const thisSpend = spendOutflowInRange(statements, tagRules, todayYmd, windowEnd);
  const priorSpend = spendOutflowInRange(statements, tagRules, priorStartYmd, priorEndYmd);

  const topMerchants = [...thisSpend.merchants.entries()]
    .map(([pattern, v]) => ({ pattern, amount: Math.round(v.amount * 100) / 100, count: v.count }))
    .sort((a, b) => b.amount - a.amount)
    .slice(0, 12);

  const byCategory = [...thisSpend.byCategory.entries()]
    .map(([label, amount]) => ({ label, amount: Math.round(amount * 100) / 100 }))
    .sort((a, b) => b.amount - a.amount)
    .slice(0, 15);

  // Recurring: subscription bills + statement patterns ≥3 in ~90 days
  const recurringCandidates: AnalyzeSnapshot["recurringCandidates"] = [];
  for (const b of billsWithMeta) {
    if ((b.listType ?? "") !== "subscriptions") continue;
    const freq = (b.frequency ?? "monthly").toLowerCase();
    const amt = b.amount ?? 0;
    const monthly =
      freq.includes("year")
        ? amt / 12
        : freq.includes("2") && (freq.includes("week") || freq.includes("wk"))
          ? amt * 2.166
          : amt;
    const dueYmd = (b.nextDue ?? "").includes("T")
      ? b.nextDue!.slice(0, 10)
      : /^\d{4}-\d{2}-\d{2}/.test(b.nextDue ?? "")
        ? b.nextDue!.slice(0, 10)
        : null;
    // Loose parse for "Nov 11, 2027" style
    let dueInWindow = false;
    if (dueYmd && /^\d{4}-\d{2}-\d{2}$/.test(dueYmd)) {
      dueInWindow = dueYmd >= todayYmd && dueYmd <= windowEnd;
    } else if (b.nextDue) {
      const occs = billOccurrenceDatesInRange(b, todayYmd, windowEnd);
      dueInWindow = occs.length > 0;
    }
    recurringCandidates.push({
      name: b.name,
      source: "subscription_bill",
      amount: amt,
      count: 1,
      lastDate: dueYmd,
      monthlyEquivalent: Math.round(monthly * 100) / 100,
      frequency: b.frequency ?? null,
      dueInWindow,
    });
  }

  const lookbackStart = ymdAddDays(todayYmd, -90);
  const patternAgg = new Map<string, { amountSum: number; count: number; lastDate: string }>();
  for (const s of statements) {
    const ymd = statementDayYmd(s);
    if (!ymd || ymd < lookbackStart || ymd > todayYmd) continue;
    if (s.amount >= 0) continue;
    if (isTransferDescription(s.description ?? "")) continue;
    const pattern = makeStatementPattern(s.description ?? "");
    if (!pattern || pattern.length < 3) continue;
    const prev = patternAgg.get(pattern) ?? { amountSum: 0, count: 0, lastDate: ymd };
    patternAgg.set(pattern, {
      amountSum: prev.amountSum + absOutflow(s.amount),
      count: prev.count + 1,
      lastDate: ymd > prev.lastDate ? ymd : prev.lastDate,
    });
  }
  for (const [pattern, v] of patternAgg) {
    if (v.count < 3) continue;
    const avg = v.amountSum / v.count;
    if (recurringCandidates.some((r) => r.name.toUpperCase().includes(pattern.slice(0, 8)))) continue;
    recurringCandidates.push({
      name: pattern,
      source: "statement_pattern",
      amount: Math.round(avg * 100) / 100,
      count: v.count,
      lastDate: v.lastDate,
      monthlyEquivalent: Math.round(avg * 100) / 100,
      frequency: "recurring_pattern",
      dueInWindow: false,
    });
  }
  // Prefer actionable (due in window / monthly) over annual renewals far out
  recurringCandidates.sort((a, b) => {
    if (a.dueInWindow !== b.dueInWindow) return a.dueInWindow ? -1 : 1;
    return (b.monthlyEquivalent ?? b.amount) - (a.monthlyEquivalent ?? a.amount);
  });

  const fmt = (n: number | null | undefined) =>
    n == null || Number.isNaN(n) ? "—" : `$${Math.round(n * 100) / 100}`;

  const cashPictureLines: string[] = accounts.map((a) => {
    const enough =
      a.projected == null ? "balance unknown" : a.projected >= a.required ? "enough for required" : "short vs required";
    return `${a.label}: balance ${fmt(a.balance)}, planned in ${fmt(a.plannedIn)}, planned out ${fmt(a.plannedOut)}, projected ${fmt(a.projected)}, required ${fmt(a.required)} (${enough}).`;
  });
  if (paychecksNearWindow.length > 0) {
    cashPictureLines.push(
      `Paychecks in window: ${paychecksNearWindow.map((p) => `${p.name} ${fmt(p.amount)} on ${p.date}`).join("; ")}.`
    );
  } else {
    cashPictureLines.push("No paychecks scheduled in this window.");
  }
  cashPictureLines.push(
    `Recorded statement spend this cycle: ${fmt(Math.round(thisSpend.total * 100) / 100)} (different from planned bill outflows).`
  );

  return {
    window: {
      todayYmd,
      nextPaydayYmd,
      nextPaydayLabel,
      daysUntilPayday,
    },
    accounts,
    paychecksNearWindow: paychecksNearWindow.sort((a, b) => a.date.localeCompare(b.date)),
    largeUpcomingBills: largeUpcoming.slice(0, 20),
    spend: {
      thisCycleOutflow: Math.round(thisSpend.total * 100) / 100,
      priorCycleOutflow: Math.round(priorSpend.total * 100) / 100,
      topMerchants,
      byCategory,
    },
    recurringCandidates: recurringCandidates.slice(0, 25),
    cashPictureLines,
    dataNotes,
  };
}
