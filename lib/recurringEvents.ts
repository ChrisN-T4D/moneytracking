/**
 * Build a unified list of recurring events (income + expenses) for a given month.
 * Used by the Recurring tab's calendar and list views.
 *
 * Bill expense dates match the Bills tab: same subsection grouping (earliest next due per group).
 * "Paid" in this tab is manual only (`recurringPaidCycle` on each bill), not statement-driven.
 */
import type {
  BillListAccount,
  BillListType,
  BillOrSub,
  AutoTransfer,
  SpanishForkBill,
  PaycheckConfig,
  MoneyGoal,
} from "./types";
import {
  filterBillsWithMeta,
  groupBillsBySubsection,
  isSyntheticBillSubsectionKey,
  type BillOrSubWithMeta,
} from "./pocketbase";
import { spanishForkMortgageDisplayName } from "./mortgageBillNames";
import { goalsForBillName, creditAmountForMarkPaid } from "./goalRouting";
import { expectedPaychecksThisMonthDetail, allPayDatesNearMonth } from "./summaryCalculations";
import { parseFlexibleDate, getNextAutoTransferDate } from "./paycheckDates";
import {
  recurringCycleKeyForExpense,
  isManualRecurringPaidForKey,
} from "./recurringPaidCycle";

export interface RecurringManualPaidMeta {
  cycleKey: string;
  collection: "bills" | "spanish_fork_bills";
  ids: string[];
  goalCandidates: { id: string; name: string }[];
  membersForCredit: { name: string; amount: number }[];
  lineAmount: number;
  storedGoalId: string | null;
  storedStatementId: string | null;
  appliedCreditAmount: number;
}

export interface RecurringEvent {
  id: string;
  date: string;
  type: "income" | "expense" | "transfer";
  account: string;
  /** For transfers: source account (money leaving). Inferred when destination is bills/SF. */
  fromAccount?: string;
  name: string;
  amount: number;
  recurrence: string;
  isPaid?: boolean;
  /** When set, user can mark / unmark paid for this cycle (PocketBase). */
  manualPaid?: RecurringManualPaidMeta;
}

function toYMD(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function recurrenceLabel(freq: string): string {
  const f = (freq ?? "").toLowerCase().replace(/\s/g, "");
  if (f === "2weeks" || f === "biweekly") return "Every 2 weeks";
  if (f === "monthly" || f === "monthlylastworkingday") return "Every month";
  if (f === "yearly") return "Every year";
  return freq;
}

/**
 * Get all bill due-date occurrences that fall within year/month.
 * For monthly bills the nextDue gives one date; for 2-week bills we walk the cycle.
 */
function billDatesInMonth(bill: BillOrSub, year: number, month: number): string[] {
  const first = new Date(year, month, 1);
  const last = new Date(year, month + 1, 0);
  const results: string[] = [];

  if (!bill.nextDue) return results;
  const due = parseFlexibleDate(bill.nextDue);
  if (Number.isNaN(due.getTime())) return results;

  const freq = (bill.frequency ?? "monthly").toLowerCase();
  if (freq === "2weeks") {
    const d = new Date(due.getTime());
    while (d > last) d.setDate(d.getDate() - 14);
    while (d < first) d.setDate(d.getDate() + 14);
    while (d <= last) {
      if (d >= first) results.push(toYMD(d));
      d.setDate(d.getDate() + 14);
    }
  } else if (freq === "yearly") {
    if (due.getMonth() === month && due >= first && due <= last) {
      results.push(toYMD(due));
    }
  } else {
    const day = due.getDate();
    const clampedDay = Math.min(day, last.getDate());
    const d = new Date(year, month, clampedDay);
    results.push(toYMD(d));
  }
  return results;
}

/** Normalize AutoTransfer.account to canonical key (bills_account, spanish_fork, or leave as-is for checking/other). */
function transferDestinationAccount(t: AutoTransfer): string {
  const acc = (t.account ?? "").trim().toLowerCase();
  if (acc.includes("bills") && !acc.includes("spanish")) return "bills_account";
  if (acc.includes("spanish") || acc === "spanish fork") return "spanish_fork";
  return acc || "checking_account";
}

/** When destination is bills or SF, money is assumed to leave checking. */
function transferFromAccount(destAccount: string): string | undefined {
  if (destAccount === "bills_account" || destAccount === "spanish_fork") return "checking_account";
  return undefined;
}

const BILL_SECTIONS: readonly (readonly [BillListAccount, BillListType])[] = [
  ["bills_account", "bills"],
  ["bills_account", "subscriptions"],
  ["checking_account", "bills"],
  ["checking_account", "subscriptions"],
];

export function buildRecurringEvents(
  paycheckConfigs: PaycheckConfig[],
  billsWithMeta: BillOrSubWithMeta[],
  spanishForkBills: SpanishForkBill[],
  autoTransfers: AutoTransfer[],
  year: number,
  month: number,
  goals: Pick<MoneyGoal, "id" | "name" | "category">[] = []
): RecurringEvent[] {
  const events: RecurringEvent[] = [];
  const refDate = new Date(year, month, 1);
  const payDatesNear = allPayDatesNearMonth(paycheckConfigs, year, month);
  const { payDates } = expectedPaychecksThisMonthDetail(paycheckConfigs, refDate);

  for (const p of payDates) {
    events.push({
      id: `paycheck-${p.name}-${toYMD(p.date)}`,
      date: toYMD(p.date),
      type: "income",
      account: "checking_account",
      name: p.name || "Paycheck",
      amount: p.amount,
      recurrence: "Every 2 weeks",
    });
  }

  for (const [account, listType] of BILL_SECTIONS) {
    const filtered = filterBillsWithMeta(billsWithMeta, account, listType);
    if (filtered.length === 0) continue;
    const { items: groupedItems, membersByGroupKey } = groupBillsBySubsection(filtered);
    for (const item of groupedItems) {
      const groupKey = item.subsection ?? "";
      const members = membersByGroupKey.get(groupKey) ?? [];
      const dates = billDatesInMonth(item, year, month);
      const isSynthetic = isSyntheticBillSubsectionKey(groupKey);
      const candidates = isSynthetic ? [] : goalsForBillName(goals, item.name);
      const requireGoalIds = candidates.length > 0;
      const membersForCredit = members.map((m) => ({
        name: m.name,
        amount: m.amount,
      }));

      for (const d of dates) {
        const cycleKey = recurringCycleKeyForExpense(
          d,
          item.frequency,
          year,
          month,
          paycheckConfigs,
          payDatesNear
        );
        const isPaid = isManualRecurringPaidForKey(members, cycleKey, requireGoalIds);
        const ids = members.map((m) => m.id);
        const storedGid = isPaid
          ? (members[0]?.recurringPaidGoalId ?? "").trim() || null
          : null;
        const storedStmt = isPaid
          ? (members[0]?.recurringPaidStatementId ?? "").trim() || null
          : null;
        const goalForApplied = storedGid ? goals.find((g) => g.id === storedGid) : undefined;
        const appliedCreditAmount =
          isPaid && goalForApplied
            ? creditAmountForMarkPaid(membersForCredit, goalForApplied, item.amount)
            : 0;
        events.push({
          id: `bill-${account}-${listType}-${d}-${item.name.replace(/\s/g, "-")}`,
          date: d,
          type: "expense",
          account,
          name: item.name,
          amount: item.amount,
          recurrence: recurrenceLabel(item.frequency),
          isPaid,
          manualPaid: {
            cycleKey,
            collection: "bills",
            ids,
            goalCandidates: candidates.map((c) => ({ id: c.id, name: c.name })),
            membersForCredit,
            lineAmount: item.amount,
            storedGoalId: storedGid,
            storedStatementId: storedStmt,
            appliedCreditAmount,
          },
        });
      }
    }
  }

  for (const b of spanishForkBills) {
    const asRow: BillOrSub = {
      id: b.id,
      name: b.name,
      frequency: (b.frequency as BillOrSub["frequency"]) || "monthly",
      nextDue: b.nextDue ?? "",
      inThisPaycheck: b.inThisPaycheck,
      amount: b.amount,
      recurringPaidCycle: b.recurringPaidCycle ?? null,
      recurringPaidGoalId: b.recurringPaidGoalId ?? null,
      recurringPaidStatementId: b.recurringPaidStatementId ?? null,
    };
    const sfDisplayName = spanishForkMortgageDisplayName(b.name);
    const dates = billDatesInMonth(asRow, year, month);
    const memberMeta = [
      {
        recurringPaidCycle: b.recurringPaidCycle,
        recurringPaidGoalId: b.recurringPaidGoalId,
      },
    ];
    const sfCreditMembers = [{ name: b.name, amount: b.amount }];
    const sfCandidates = goalsForBillName(goals, b.name);
    const sfRequireGoalIds = sfCandidates.length > 0;
    for (const d of dates) {
      const cycleKey = recurringCycleKeyForExpense(
        d,
        asRow.frequency,
        year,
        month,
        paycheckConfigs,
        payDatesNear
      );
      const isPaid = isManualRecurringPaidForKey(memberMeta, cycleKey, sfRequireGoalIds);
      const storedGid = isPaid ? (b.recurringPaidGoalId ?? "").trim() || null : null;
      const storedStmt = isPaid ? (b.recurringPaidStatementId ?? "").trim() || null : null;
      const sfGoalForApplied = storedGid ? goals.find((g) => g.id === storedGid) : undefined;
      const sfAppliedCredit =
        isPaid && sfGoalForApplied
          ? creditAmountForMarkPaid(sfCreditMembers, sfGoalForApplied, b.amount)
          : 0;
      events.push({
        id: `sf-${b.id}-${d}`,
        date: d,
        type: "expense",
        account: "spanish_fork",
        name: sfDisplayName,
        amount: b.amount,
        recurrence: recurrenceLabel(b.frequency),
        isPaid,
        manualPaid: {
          cycleKey,
          collection: "spanish_fork_bills",
          ids: [b.id],
          goalCandidates: sfCandidates.map((c) => ({ id: c.id, name: c.name })),
          membersForCredit: sfCreditMembers,
          lineAmount: b.amount,
          storedGoalId: storedGid,
          storedStatementId: storedStmt,
          appliedCreditAmount: sfAppliedCredit,
        },
      });
    }
  }

  for (const t of autoTransfers) {
    if (!t.date) continue;
    const destAccount = transferDestinationAccount(t);
    const fromAcc = transferFromAccount(destAccount);
    const freq = (t.frequency ?? "monthly").toLowerCase();
    const nextDate = getNextAutoTransferDate(t.date, t.frequency, refDate);
    if (Number.isNaN(nextDate.getTime())) continue;
    const last = new Date(year, month + 1, 0);
    const d = new Date(nextDate.getTime());
    if (freq.includes("2") && (freq.includes("week") || freq.includes("wk"))) {
      while (d > last) d.setDate(d.getDate() - 14);
      const first = new Date(year, month, 1);
      while (d < first) d.setDate(d.getDate() + 14);
      while (d <= last) {
        events.push({
          id: `at-${t.id}-${toYMD(d)}`,
          date: toYMD(d),
          type: "transfer",
          account: destAccount,
          fromAccount: fromAcc,
          name: t.whatFor,
          amount: t.amount,
          recurrence: recurrenceLabel(t.frequency),
        });
        d.setDate(d.getDate() + 14);
      }
    } else {
      if (d.getFullYear() === year && d.getMonth() === month) {
        events.push({
          id: `at-${t.id}-${toYMD(d)}`,
          date: toYMD(d),
          type: "transfer",
          account: destAccount,
          fromAccount: fromAcc,
          name: t.whatFor,
          amount: t.amount,
          recurrence: recurrenceLabel(t.frequency),
        });
      }
    }
  }

  events.sort((a, b) => a.date.localeCompare(b.date));
  return events;
}
