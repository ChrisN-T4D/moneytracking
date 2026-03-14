/**
 * Build a unified list of recurring events (income + expenses) for a given month.
 * Used by the Recurring tab's calendar and list views.
 */
import type { BillOrSub, AutoTransfer, SpanishForkBill, PaycheckConfig } from "./types";
import type { BillOrSubWithMeta } from "./pocketbase";
import { expectedPaychecksThisMonthDetail } from "./summaryCalculations";
import { parseFlexibleDate, getNextAutoTransferDate } from "./paycheckDates";

export interface RecurringEvent {
  id: string;
  date: string;
  type: "income" | "expense" | "transfer";
  account: string;
  name: string;
  amount: number;
  recurrence: string;
  isPaid?: boolean;
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
    // Walk backwards to find first occurrence on or before the month, then forward
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
    // Monthly: clamp day to month
    const day = due.getDate();
    const clampedDay = Math.min(day, last.getDate());
    const d = new Date(year, month, clampedDay);
    results.push(toYMD(d));
  }
  return results;
}

export function buildRecurringEvents(
  paycheckConfigs: PaycheckConfig[],
  billsWithMeta: BillOrSubWithMeta[],
  spanishForkBills: SpanishForkBill[],
  autoTransfers: AutoTransfer[],
  year: number,
  month: number,
  paidByBillKey?: Map<string, number>
): RecurringEvent[] {
  const events: RecurringEvent[] = [];
  const refDate = new Date(year, month, 1);

  // 1. Income: paychecks
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

  // 2. Expenses: bills (bills_account + checking_account)
  for (const b of billsWithMeta) {
    const account = b.account ?? "checking_account";
    const dates = billDatesInMonth(b, year, month);
    for (const d of dates) {
      const billKey = `${account}|${b.listType ?? "bills"}|${b.name.toLowerCase()}`;
      const paid = paidByBillKey?.get(billKey);
      events.push({
        id: `bill-${b.id}-${d}`,
        date: d,
        type: "expense",
        account,
        name: b.name,
        amount: b.amount,
        recurrence: recurrenceLabel(b.frequency),
        isPaid: paid !== undefined && paid > 0,
      });
    }
  }

  // 3. Expenses: Spanish Fork bills
  for (const b of spanishForkBills) {
    const dates = billDatesInMonth(b as unknown as BillOrSub, year, month);
    for (const d of dates) {
      const billKey = `spanish_fork|bills|${b.name.toLowerCase()}`;
      const paid = paidByBillKey?.get(billKey);
      events.push({
        id: `sf-${b.id}-${d}`,
        date: d,
        type: "expense",
        account: "spanish_fork",
        name: b.name,
        amount: b.amount,
        recurrence: recurrenceLabel(b.frequency),
        isPaid: paid !== undefined && paid > 0,
      });
    }
  }

  // 4. Transfers: auto transfers
  for (const t of autoTransfers) {
    if (!t.date) continue;
    const freq = (t.frequency ?? "monthly").toLowerCase();
    // Get next occurrence on or after start of month
    const nextDate = getNextAutoTransferDate(t.date, t.frequency, refDate);
    if (Number.isNaN(nextDate.getTime())) continue;
    const last = new Date(year, month + 1, 0);
    // Walk through the month
    const d = new Date(nextDate.getTime());
    // Walk backward to start of month if needed
    if (freq.includes("2") && (freq.includes("week") || freq.includes("wk"))) {
      while (d > last) d.setDate(d.getDate() - 14);
      const first = new Date(year, month, 1);
      while (d < first) d.setDate(d.getDate() + 14);
      while (d <= last) {
        events.push({
          id: `at-${t.id}-${toYMD(d)}`,
          date: toYMD(d),
          type: "transfer",
          account: t.account,
          name: t.whatFor,
          amount: t.amount,
          recurrence: recurrenceLabel(t.frequency),
        });
        d.setDate(d.getDate() + 14);
      }
    } else {
      // Monthly/yearly: single occurrence
      if (d.getFullYear() === year && d.getMonth() === month) {
        events.push({
          id: `at-${t.id}-${toYMD(d)}`,
          date: toYMD(d),
          type: "transfer",
          account: t.account,
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
