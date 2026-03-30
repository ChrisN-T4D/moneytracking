"use client";

import { useState, useMemo, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";
import { formatCurrency, displayBillName } from "@/lib/format";
import { buildRecurringEvents, type RecurringEvent } from "@/lib/recurringEvents";
import type { PaycheckConfig, AutoTransfer, SpanishForkBill, MoneyGoal } from "@/lib/types";
import type { BillOrSubWithMeta } from "@/lib/pocketbase";
import { creditAmountForMarkPaid } from "@/lib/goalRouting";
import { getNeededBeforeNextPaycheckBreakdown } from "@/lib/summaryCalculations";
import { getCardClasses } from "@/lib/themePalettes";
import { useTheme } from "./ThemeProvider";

export type RecurringProjectionSnapshot = {
  requiredThisPaycheckByAccount: { checkingAccount: number; billsAccount: number; spanishFork: number };
  nextBillsInflowAmount: number;
  nextSpanishForkInflowAmount: number;
  transfersOutOfCheckingTotal: number;
};

interface RecurringTabProps {
  paycheckConfigs: PaycheckConfig[];
  billsWithMeta: BillOrSubWithMeta[];
  spanishForkBills: SpanishForkBill[];
  autoTransfers: AutoTransfer[];
  /** For goal routing when marking paid (goal.category ↔ bill subsection). */
  goals: MoneyGoal[];
  today: Date;
  initialAccountBalances: { checking: number | null; bills: number | null; spanishFork: number | null };
  /** Same paycheck/transfer snapshot as the main dashboard (not tied to Recurring view month). */
  recurringProjection: RecurringProjectionSnapshot;
}

type CheckInKey = "checking" | "bills" | "spanishFork";

const CHECK_IN_LABELS: Record<CheckInKey, string> = {
  checking: "Joint Checking",
  bills: "Oklahoma Bills",
  spanishFork: "Spanish Fork",
};

function adjustedCheckInForProjection(
  key: CheckInKey,
  entered: number | null,
  proj: RecurringProjectionSnapshot
): number | null {
  if (entered === null) return null;
  if (key === "checking") return entered - proj.transfersOutOfCheckingTotal;
  if (key === "bills") return entered + proj.nextBillsInflowAmount;
  return entered + proj.nextSpanishForkInflowAmount;
}

function requiredForCheckInKey(
  key: CheckInKey,
  req: RecurringProjectionSnapshot["requiredThisPaycheckByAccount"]
): number {
  if (key === "checking") return req.checkingAccount;
  if (key === "bills") return req.billsAccount;
  return req.spanishFork;
}

function checkInEnough(adjusted: number | null, required: number): boolean {
  if (adjusted === null) return false;
  return required <= 0 || adjusted >= required;
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


function RecurringMarkPaidButton({
  event: e,
  busy,
  onToggle,
}: {
  event: RecurringEvent;
  busy: boolean;
  onToggle: () => void;
}) {
  if (e.type !== "expense" || !e.manualPaid) return null;
  return (
    <button
      type="button"
      disabled={busy}
      onClick={(ev) => {
        ev.preventDefault();
        ev.stopPropagation();
        onToggle();
      }}
      className={`rounded-md border px-2 py-1 text-[10px] sm:text-[11px] font-medium leading-tight shrink-0 transition-colors min-h-[28px] sm:min-h-0 disabled:opacity-50 ${
        e.isPaid
          ? "border-emerald-500/60 bg-emerald-50 text-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-300 dark:border-emerald-600/50"
          : "border-neutral-300 dark:border-neutral-600 text-neutral-700 dark:text-neutral-300 hover:bg-neutral-100 dark:hover:bg-neutral-800"
      }`}
    >
      {busy ? "…" : e.isPaid ? "Unmark" : "Mark paid"}
    </button>
  );
}

function toYMD(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

/** Calendar event colors: income = green, transfer = blue, expense = by account (bills=amber, checking=violet, spanish_fork=teal). */
function calendarEventDotClass(e: RecurringEvent): string {
  if (e.type === "income") return "bg-emerald-500";
  if (e.type === "transfer") return "bg-sky-500";
  const acc = (e.account ?? "").toLowerCase();
  if (acc.includes("bills") && !acc.includes("spanish")) return "bg-amber-500";
  if (acc.includes("spanish")) return "bg-teal-500";
  if (acc.includes("checking")) return "bg-violet-500";
  return "bg-rose-500";
}

function calendarEventPillClass(e: RecurringEvent): string {
  if (e.type === "income") return "bg-emerald-100 text-emerald-800 dark:bg-emerald-900/60 dark:text-emerald-300";
  if (e.type === "transfer") return "bg-sky-100 text-sky-800 dark:bg-sky-900/60 dark:text-sky-300";
  if (e.isPaid) return "bg-neutral-100 text-neutral-500 dark:bg-neutral-700 dark:text-neutral-400";
  const acc = (e.account ?? "").toLowerCase();
  if (acc.includes("bills") && !acc.includes("spanish")) return "bg-amber-100 text-amber-800 dark:bg-amber-900/60 dark:text-amber-300";
  if (acc.includes("spanish")) return "bg-teal-100 text-teal-800 dark:bg-teal-900/60 dark:text-teal-300";
  if (acc.includes("checking")) return "bg-violet-100 text-violet-800 dark:bg-violet-900/60 dark:text-violet-300";
  return "bg-rose-100 text-rose-800 dark:bg-rose-900/60 dark:text-rose-300";
}

function calendarEventRowClass(e: RecurringEvent): string {
  if (e.type === "income") return "bg-emerald-100 text-emerald-800 dark:bg-emerald-900/50 dark:text-emerald-300";
  if (e.type === "transfer") return "bg-sky-100 text-sky-800 dark:bg-sky-900/50 dark:text-sky-300";
  if (e.isPaid) return "bg-neutral-100 text-neutral-500 dark:bg-neutral-800 dark:text-neutral-500 line-through";
  const acc = (e.account ?? "").toLowerCase();
  if (acc.includes("bills") && !acc.includes("spanish")) return "bg-amber-50 text-amber-800 dark:bg-amber-900/40 dark:text-amber-300";
  if (acc.includes("spanish")) return "bg-teal-50 text-teal-800 dark:bg-teal-900/40 dark:text-teal-300";
  if (acc.includes("checking")) return "bg-violet-50 text-violet-800 dark:bg-violet-900/40 dark:text-violet-300";
  return "bg-rose-50 text-rose-700 dark:bg-rose-900/30 dark:text-rose-300";
}

/** Text color class for account label (matches calendar account colors). */
function neededAccountLabelClass(acct: string): string {
  const a = (acct ?? "").toLowerCase();
  if (a.includes("bills") && !a.includes("spanish")) return "text-amber-600 dark:text-amber-400";
  if (a.includes("spanish")) return "text-teal-600 dark:text-teal-400";
  if (a.includes("checking")) return "text-violet-600 dark:text-violet-400";
  return "text-neutral-800 dark:text-neutral-200";
}

export function RecurringTab({
  paycheckConfigs,
  billsWithMeta,
  spanishForkBills,
  autoTransfers,
  goals,
  today,
  initialAccountBalances,
  recurringProjection,
}: RecurringTabProps) {
  const router = useRouter();
  const { theme } = useTheme();
  const [viewMonth, setViewMonth] = useState(() => new Date(today.getFullYear(), today.getMonth(), 1));
  const [view, setView] = useState<"list" | "calendar">("list");
  const [isMobile, setIsMobile] = useState(false);
  const [neededBreakdownOpen, setNeededBreakdownOpen] = useState<"checking_account" | "bills_account" | "spanish_fork" | null>(null);
  const [selectedCalendarDate, setSelectedCalendarDate] = useState<string | null>(null);
  const [manualPaidPendingId, setManualPaidPendingId] = useState<string | null>(null);
  const [goalPickFor, setGoalPickFor] = useState<RecurringEvent | null>(null);
  const [goalPickSelectedId, setGoalPickSelectedId] = useState("");
  const [checkInBalances, setCheckInBalances] = useState<Record<CheckInKey, number | null>>(() => ({
    checking: initialAccountBalances.checking,
    bills: initialAccountBalances.bills,
    spanishFork: initialAccountBalances.spanishFork,
  }));
  const [checkInEditing, setCheckInEditing] = useState<CheckInKey | null>(null);
  const [checkInEditValue, setCheckInEditValue] = useState("");
  const [checkInSaving, setCheckInSaving] = useState(false);

  const { requiredThisPaycheckByAccount } = recurringProjection;

  useEffect(() => {
    setCheckInBalances({
      checking: initialAccountBalances.checking,
      bills: initialAccountBalances.bills,
      spanishFork: initialAccountBalances.spanishFork,
    });
  }, [initialAccountBalances.checking, initialAccountBalances.bills, initialAccountBalances.spanishFork]);

  const neededBreakdown = useMemo(
    () => getNeededBeforeNextPaycheckBreakdown(billsWithMeta, spanishForkBills),
    [billsWithMeta, spanishForkBills]
  );
  useEffect(() => {
    const mq = window.matchMedia("(max-width: 639px)");
    const update = () => setIsMobile(mq.matches);
    update();
    mq.addEventListener("change", update);
    return () => mq.removeEventListener("change", update);
  }, []);

  const year = viewMonth.getFullYear();
  const month = viewMonth.getMonth();
  const monthName = viewMonth.toLocaleString("en-US", { month: "long", year: "numeric" });
  const isCurrentMonth = today.getFullYear() === year && today.getMonth() === month;
  const todayYMD = toYMD(today);

  const events = useMemo(
    () =>
      buildRecurringEvents(
        paycheckConfigs,
        billsWithMeta,
        spanishForkBills,
        autoTransfers,
        year,
        month,
        goals
      ),
    [paycheckConfigs, billsWithMeta, spanishForkBills, autoTransfers, year, month, goals]
  );

  const applyMarkPaidWithGoal = useCallback(
    async (e: RecurringEvent, goalId: string | null) => {
      const mp = e.manualPaid;
      if (!mp || e.type !== "expense") return;

      const pickedCandidate = goalId
        ? mp.goalCandidates.find((c) => c.id === goalId)
        : undefined;
      const selectedGoal = goalId
        ? goals.find((g) => g.id === goalId)
        : undefined;
      const goalForCredit =
        selectedGoal ?? (pickedCandidate ? { name: pickedCandidate.name } : undefined);
      const credit =
        goalForCredit && goalId
          ? creditAmountForMarkPaid(mp.membersForCredit, goalForCredit, mp.lineAmount)
          : 0;

      const res = await fetch("/api/recurring-mark-paid", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          action: "mark",
          collection: mp.collection,
          billIds: mp.ids,
          cycleKey: mp.cycleKey,
          goalId,
          creditAmount: credit,
          dateYmd: e.date,
          lineLabel: e.name,
        }),
      });
      const data = (await res.json().catch(() => ({}))) as {
        ok?: boolean;
        message?: string;
        statementId?: string | null;
      };
      if (!res.ok || data.ok === false) {
        throw new Error(data.message ?? `Save failed (${res.status})`);
      }
      router.refresh();
    },
    [goals, router]
  );

  const applyUnmarkPaid = useCallback(
    async (e: RecurringEvent) => {
      const mp = e.manualPaid;
      if (!mp || e.type !== "expense") return;

      const res = await fetch("/api/recurring-mark-paid", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          action: "unmark",
          collection: mp.collection,
          billIds: mp.ids,
          storedStatementId: mp.storedStatementId,
          storedGoalId: mp.storedGoalId,
        }),
      });
      const data = (await res.json().catch(() => ({}))) as {
        ok?: boolean;
        message?: string;
      };
      if (!res.ok || data.ok === false) {
        throw new Error(data.message ?? `Save failed (${res.status})`);
      }
      router.refresh();
    },
    [router]
  );

  const onMarkPaidClick = useCallback(
    async (e: RecurringEvent) => {
      if (e.type !== "expense" || !e.manualPaid) return;
      if (e.isPaid) {
        setManualPaidPendingId(e.id);
        try {
          await applyUnmarkPaid(e);
        } catch (err) {
          window.alert(err instanceof Error ? err.message : "Could not unmark paid.");
        } finally {
          setManualPaidPendingId(null);
        }
        return;
      }
      const c = e.manualPaid.goalCandidates;
      if (c.length >= 1) {
        setGoalPickSelectedId(c[0]?.id ?? "");
        setGoalPickFor(e);
        return;
      }
      const gid = null;
      setManualPaidPendingId(e.id);
      try {
        await applyMarkPaidWithGoal(e, gid);
      } catch (err) {
        window.alert(err instanceof Error ? err.message : "Could not update paid status.");
      } finally {
        setManualPaidPendingId(null);
      }
    },
    [applyMarkPaidWithGoal, applyUnmarkPaid]
  );

  async function confirmGoalPick() {
    const e = goalPickFor;
    if (!e) return;
    const gid = goalPickSelectedId?.trim() ?? "";
    if (!gid) {
      window.alert("Select a goal before marking paid.");
      return;
    }
    setGoalPickFor(null);
    setManualPaidPendingId(e.id);
    try {
      await applyMarkPaidWithGoal(e, gid);
    } catch (err) {
      window.alert(err instanceof Error ? err.message : "Could not update paid status.");
    } finally {
      setManualPaidPendingId(null);
    }
  }

  const checkInKeys = ["checking", "bills", "spanishFork"] as const satisfies readonly CheckInKey[];

  function startCheckInEdit(key: CheckInKey) {
    setCheckInEditing(key);
    setCheckInEditValue(checkInBalances[key] != null ? String(checkInBalances[key]) : "");
  }

  async function commitCheckInEdit(key: CheckInKey) {
    const raw = checkInEditValue.trim();
    let num: number | null;
    if (raw === "") {
      num = null;
    } else {
      const parsed = Number(raw);
      if (Number.isNaN(parsed)) {
        window.alert("Enter a valid number.");
        setCheckInEditing(null);
        return;
      }
      num = parsed;
    }
    setCheckInEditing(null);
    if (num === checkInBalances[key]) return;
    const prev = checkInBalances[key];
    setCheckInBalances((b) => ({ ...b, [key]: num }));
    setCheckInSaving(true);
    try {
      const res = await fetch("/api/summary", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          checkingBalance: key === "checking" ? num : undefined,
          billsBalance: key === "bills" ? num : undefined,
          spanishForkBalance: key === "spanishFork" ? num : undefined,
        }),
      });
      if (!res.ok) {
        setCheckInBalances((b) => ({ ...b, [key]: prev }));
        const t = await res.text().catch(() => "");
        window.alert(t || "Could not save balance.");
      } else {
        router.refresh();
      }
    } catch (e) {
      setCheckInBalances((b) => ({ ...b, [key]: prev }));
      window.alert(e instanceof Error ? e.message : "Could not save balance.");
    } finally {
      setCheckInSaving(false);
    }
  }

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

  // Group upcoming by account: incoming and outgoing lists per account
  const ACCOUNT_ORDER = ["checking_account", "bills_account", "spanish_fork"] as const;
  const upcomingByAccount = useMemo(() => {
    const result: Record<string, { incoming: RecurringEvent[]; outgoing: RecurringEvent[] }> = {};
    for (const acct of ACCOUNT_ORDER) {
      const incoming = upcomingEvents.filter(
        (e) =>
          (e.type === "income" && e.account === acct) || (e.type === "transfer" && e.account === acct)
      );
      const outgoing = upcomingEvents.filter(
        (e) =>
          (e.type === "expense" && e.account === acct) ||
          (e.type === "transfer" && e.fromAccount === acct)
      );
      incoming.sort((a, b) => a.date.localeCompare(b.date));
      outgoing.sort((a, b) => a.date.localeCompare(b.date));
      if (incoming.length > 0 || outgoing.length > 0) {
        result[acct] = { incoming, outgoing };
      }
    }
    return result;
  }, [upcomingEvents]);

  function goToday() { setViewMonth(new Date(today.getFullYear(), today.getMonth(), 1)); }
  function prevMonth() { setViewMonth(new Date(year, month - 1, 1)); }
  function nextMonth() { setViewMonth(new Date(year, month + 1, 1)); }

  // Group events by day for calendar (by day-of-month for list view)
  const eventsByDay = useMemo(() => {
    const m = new Map<number, RecurringEvent[]>();
    for (const e of events) {
      const day = parseInt(e.date.slice(8, 10), 10);
      if (!m.has(day)) m.set(day, []);
      m.get(day)!.push(e);
    }
    return m;
  }, [events]);

  // Events by YMD for calendar grid (any month)
  const eventsByYMD = useMemo(() => {
    const m = new Map<string, RecurringEvent[]>();
    for (const e of events) {
      if (!m.has(e.date)) m.set(e.date, []);
      m.get(e.date)!.push(e);
    }
    return m;
  }, [events]);

  // Calendar grid: 6 weeks × 7 days (Monday first). Each cell: { ymd, dayNum, isCurrentMonth }
  const calendarGrid = useMemo(() => {
    const first = new Date(year, month, 1);
    const last = new Date(year, month + 1, 0);
    const startDow = (first.getDay() + 6) % 7;
    const startOffset = startDow;
    const daysInMonth = last.getDate();
    const totalCells = 42;
    const grid: { ymd: string; dayNum: number; isCurrentMonth: boolean }[] = [];
    for (let i = 0; i < totalCells; i++) {
      const dayIndex = i - startOffset + 1;
      if (dayIndex < 1) {
        const prev = new Date(year, month, 0);
        prev.setDate(prev.getDate() + dayIndex);
        grid.push({
          ymd: toYMD(prev),
          dayNum: prev.getDate(),
          isCurrentMonth: false,
        });
      } else if (dayIndex > daysInMonth) {
        const next = new Date(year, month, dayIndex);
        grid.push({
          ymd: toYMD(next),
          dayNum: next.getDate(),
          isCurrentMonth: false,
        });
      } else {
        grid.push({
          ymd: `${year}-${String(month + 1).padStart(2, "0")}-${String(dayIndex).padStart(2, "0")}`,
          dayNum: dayIndex,
          isCurrentMonth: true,
        });
      }
    }
    return grid;
  }, [year, month]);

  // Previous days in current month (1 .. today-1) when viewing current month; for expandable "Previous" section
  const previousDaysInMonthList = useMemo(() => {
    if (year !== today.getFullYear() || month !== today.getMonth()) return [];
    const todayNum = today.getDate();
    if (todayNum <= 1) return [];
    const out: { date: string; dayNum: number }[] = [];
    for (let d = 1; d < todayNum; d++) {
      const ymd = `${year}-${String(month + 1).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
      out.push({ date: ymd, dayNum: d });
    }
    return out;
  }, [year, month, today]);

  // All days in current view month (for vertical calendar list); start from today when viewing current month
  const daysInMonthList = useMemo(() => {
    const lastDay = new Date(year, month + 1, 0).getDate();
    const startDay =
      year === today.getFullYear() && month === today.getMonth()
        ? today.getDate()
        : 1;
    const out: { date: string; dayNum: number }[] = [];
    for (let d = startDay; d <= lastDay; d++) {
      const ymd = `${year}-${String(month + 1).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
      out.push({ date: ymd, dayNum: d });
    }
    return out;
  }, [year, month, today]);

  return (
    <div className="space-y-4">
      {/* Month nav */}
      <div className={getCardClasses(theme.summary)}>
        <div className="flex items-center justify-between gap-2">
          <button type="button" onClick={prevMonth} className="rounded-lg p-3 sm:p-2 hover:bg-neutral-100 dark:hover:bg-neutral-800 min-h-[44px] min-w-[44px] flex items-center justify-center" aria-label="Previous month">
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" /></svg>
          </button>
          <div className="text-center flex-1 min-w-0">
            <h2 className="text-base sm:text-lg font-semibold text-neutral-900 dark:text-neutral-100 truncate">{monthName}</h2>
          </div>
          <button type="button" onClick={nextMonth} className="rounded-lg p-3 sm:p-2 hover:bg-neutral-100 dark:hover:bg-neutral-800 min-h-[44px] min-w-[44px] flex items-center justify-center" aria-label="Next month">
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" /></svg>
          </button>
        </div>
        <div className="flex items-center justify-center gap-2 mt-2">
          {!isCurrentMonth && view === "list" && (
            <button type="button" onClick={goToday} className="rounded-lg border border-neutral-300 dark:border-neutral-600 px-3 py-1.5 sm:py-1 text-xs sm:text-xs font-medium text-neutral-700 dark:text-neutral-300 hover:bg-neutral-100 dark:hover:bg-neutral-800">
              Today
            </button>
          )}
          <div className="flex rounded-lg border border-neutral-300 dark:border-neutral-600 overflow-hidden">
            <button type="button" onClick={() => setView("list")} className={`flex-1 min-h-[44px] sm:min-h-0 px-4 sm:px-3 py-2.5 sm:py-1 text-sm sm:text-xs font-medium transition-colors ${view === "list" ? "bg-sky-600 text-white" : "text-neutral-600 dark:text-neutral-400 hover:bg-neutral-100 dark:hover:bg-neutral-800"}`}>
              List
            </button>
            <button type="button" onClick={() => setView("calendar")} className={`flex-1 min-h-[44px] sm:min-h-0 px-4 sm:px-3 py-2.5 sm:py-1 text-sm sm:text-xs font-medium transition-colors ${view === "calendar" ? "bg-sky-600 text-white" : "text-neutral-600 dark:text-neutral-400 hover:bg-neutral-100 dark:hover:bg-neutral-800"}`}>
              Calendar
            </button>
          </div>
        </div>
      </div>

      {/* Check-in balances — same summary fields as Account levels; projection matches home (next paycheck window). */}
      <div className={getCardClasses(theme.summary)}>
        <h2 className="text-sm font-semibold text-neutral-900 dark:text-white mb-1">Check-in balances</h2>
        <p className="text-[11px] text-neutral-500 dark:text-neutral-400 mb-3">
          Enter actual balances (saved for everyone). Green = enough for this paycheck after recurring transfers through next payday.
        </p>
        <div className="overflow-x-auto">
          <table className="w-full text-sm min-w-[320px]">
            <thead>
              <tr className="text-xs text-neutral-500 dark:text-neutral-400 border-b border-neutral-200 dark:border-neutral-600">
                <th className="text-left font-medium pb-1.5 pr-2">Account</th>
                <th className="text-right font-medium pb-1.5">Required</th>
                <th className="text-right font-medium pb-1.5 pl-2">Balance</th>
                <th className="text-right font-medium pb-1.5 pl-2 hidden sm:table-cell">Adjusted</th>
                <th className="text-right font-medium pb-1.5 pl-2">OK?</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-neutral-100 dark:divide-neutral-700/50">
              {checkInKeys.map((key) => {
                const required = requiredForCheckInKey(key, requiredThisPaycheckByAccount);
                const entered = checkInBalances[key];
                const adjusted = adjustedCheckInForProjection(key, entered, recurringProjection);
                const enough = checkInEnough(adjusted, required);
                const editing = checkInEditing === key;
                let footnote: string | null = null;
                if (key === "checking" && recurringProjection.transfersOutOfCheckingTotal > 0) {
                  footnote = `After −${formatCurrency(recurringProjection.transfersOutOfCheckingTotal)} transfers out`;
                } else if (key === "bills" && recurringProjection.nextBillsInflowAmount > 0) {
                  footnote = `Includes +${formatCurrency(recurringProjection.nextBillsInflowAmount)} incoming transfer`;
                } else if (key === "spanishFork" && recurringProjection.nextSpanishForkInflowAmount > 0) {
                  footnote = `Includes +${formatCurrency(recurringProjection.nextSpanishForkInflowAmount)} incoming transfer`;
                }

                return (
                  <tr key={key}>
                    <td className="py-3 align-top font-medium text-neutral-700 dark:text-neutral-300 pr-2">
                      <div>{CHECK_IN_LABELS[key]}</div>
                      {footnote && (
                        <p className="mt-1 text-[10px] text-neutral-500 dark:text-neutral-400 font-normal normal-case sm:hidden">
                          {footnote}
                        </p>
                      )}
                    </td>
                    <td className="py-3 align-top text-right tabular-nums text-neutral-600 dark:text-neutral-400">
                      {formatCurrency(required)}
                    </td>
                    <td className="py-3 align-top pl-2 text-right">
                      {editing ? (
                        <input
                          autoFocus
                          type="number"
                          inputMode="decimal"
                          value={checkInEditValue}
                          onChange={(e) => setCheckInEditValue(e.target.value)}
                          onBlur={() => void commitCheckInEdit(key)}
                          onKeyDown={(e) => {
                            if (e.key === "Enter") void commitCheckInEdit(key);
                            if (e.key === "Escape") setCheckInEditing(null);
                          }}
                          className="w-24 rounded border border-sky-400 bg-white dark:bg-neutral-900 px-1.5 py-0.5 text-right text-sm tabular-nums text-neutral-900 dark:text-neutral-100 outline-none"
                        />
                      ) : (
                        <button
                          type="button"
                          onClick={() => startCheckInEdit(key)}
                          title="Tap to enter balance"
                          className={`tabular-nums font-medium underline-offset-2 hover:underline cursor-text ${
                            entered === null
                              ? "text-neutral-400 dark:text-neutral-500"
                              : enough
                                ? "text-emerald-600 dark:text-emerald-400"
                                : "text-red-600 dark:text-red-400"
                          }`}
                        >
                          {entered === null ? "—" : formatCurrency(entered)}
                        </button>
                      )}
                    </td>
                    <td className="py-3 align-top pl-2 text-right hidden sm:table-cell">
                      <span className="tabular-nums text-neutral-700 dark:text-neutral-200">
                        {adjusted === null ? "—" : formatCurrency(adjusted)}
                      </span>
                      {footnote && (
                        <p className="mt-1 text-[10px] text-neutral-500 dark:text-neutral-400 whitespace-normal max-w-[140px] ml-auto">
                          {footnote}
                        </p>
                      )}
                    </td>
                    <td className="py-3 align-top pl-2 text-right">
                      {adjusted === null ? (
                        <span className="text-xs text-neutral-400">—</span>
                      ) : enough ? (
                        <span className="text-emerald-600 dark:text-emerald-400 text-xs font-medium">Enough</span>
                      ) : (
                        <span className="text-red-600 dark:text-red-400 text-xs font-medium">Short</span>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        {checkInSaving && <p className="text-xs text-neutral-400 mt-2 text-right">Saving…</p>}
      </div>

      {/* Calendar view: month grid (responsive for mobile and desktop) */}
      {view === "calendar" && (
        <div className={getCardClasses(theme.summary)}>
          <div className="overflow-x-auto -mx-1 sm:mx-0">
            <h3 className="text-xs font-semibold text-neutral-500 dark:text-neutral-400 uppercase tracking-wider mb-2 sm:mb-3 text-center">
              {monthName}
            </h3>
            <div className="min-w-0 w-full max-w-full">
              {/* Day-of-week headers: short on mobile (M T W...) to fit */}
              <div className="grid grid-cols-7 border-b border-neutral-200 dark:border-neutral-600">
                {(isMobile ? ["M", "T", "W", "T", "F", "S", "S"] : ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"]).map((d, i) => {
                  const isCurrentWeekday = (today.getDay() + 6) % 7 === i;
                  return (
                    <div
                      key={i}
                      className={`py-1 sm:py-1.5 text-center text-[10px] sm:text-[11px] font-semibold uppercase tracking-wider ${
                        isCurrentWeekday
                          ? "text-sky-600 dark:text-sky-400 bg-sky-50/80 dark:bg-sky-900/30"
                          : "text-neutral-500 dark:text-neutral-400"
                      }`}
                    >
                      {d}
                    </div>
                  );
                })}
              </div>
              {/* 6 weeks × 7 days grid — compact on mobile */}
              <div className="grid grid-cols-7 border border-t-0 border-neutral-200 dark:border-neutral-600">
                {calendarGrid.map((cell) => {
                  const dayEvents = eventsByYMD.get(cell.ymd) ?? [];
                  const isToday = cell.ymd === todayYMD;
                  const isSelected = selectedCalendarDate === cell.ymd;
                  return (
                    <button
                      key={cell.ymd}
                      type="button"
                      onClick={() => setSelectedCalendarDate(isSelected ? null : cell.ymd)}
                      className={`min-h-[48px] sm:min-h-[64px] md:min-h-[72px] p-0.5 sm:p-1.5 flex flex-col items-center justify-start text-left border-b border-r border-neutral-100 dark:border-neutral-700/50 last:border-r-0 focus:outline-none focus:ring-1 focus:ring-sky-400 ${
                        !cell.isCurrentMonth ? "bg-neutral-50/80 dark:bg-neutral-800/40 text-neutral-400 dark:text-neutral-500" : "bg-white dark:bg-neutral-900/50 text-neutral-800 dark:text-neutral-200 hover:bg-neutral-50 dark:hover:bg-neutral-800/50"
                      } ${isSelected ? "ring-2 ring-red-500 dark:ring-red-400 ring-inset" : ""}`}
                    >
                      <span
                        className={`inline-flex items-center justify-center w-6 h-6 sm:w-7 sm:h-7 text-xs sm:text-sm font-medium rounded-full shrink-0 ${
                          isToday
                            ? "bg-sky-500 text-white"
                            : cell.isCurrentMonth
                              ? "text-neutral-900 dark:text-neutral-100"
                              : "text-neutral-400 dark:text-neutral-500"
                        }`}
                      >
                        {cell.dayNum}
                      </span>
                      {/* Event badges: dots on mobile, pills on larger screens */}
                      <div className="w-full mt-0.5 flex flex-wrap gap-0.5 justify-center min-h-[1rem] sm:min-h-[1.25rem] overflow-hidden">
                        {isMobile ? (
                          dayEvents.length > 0 && (
                            <span className="flex gap-0.5 flex-wrap justify-center">
                              {dayEvents.slice(0, 4).map((e) => (
                                <span
                                  key={e.id}
                                  className={`w-1.5 h-1.5 rounded-full shrink-0 ${calendarEventDotClass(e)}`}
                                  title={`${displayBillName(e.name)} ${formatCurrency(e.amount)}`}
                                />
                              ))}
                              {dayEvents.length > 4 && <span className="text-[9px] text-neutral-400">+</span>}
                            </span>
                          )
                        ) : (
                          <>
                            {dayEvents.slice(0, 3).map((e) => (
                              <span
                                key={e.id}
                                className={`inline-block max-w-full truncate px-1.5 py-0.5 rounded text-[10px] font-medium ${calendarEventPillClass(e)}`}
                                title={`${displayBillName(e.name)} ${formatCurrency(e.amount)}`}
                              >
                                {displayBillName(e.name).slice(0, 8)}{displayBillName(e.name).length > 8 ? "…" : ""}
                              </span>
                            ))}
                            {dayEvents.length > 3 && (
                              <span className="text-[10px] text-neutral-400 dark:text-neutral-500">+{dayEvents.length - 3}</span>
                            )}
                          </>
                        )}
                      </div>
                    </button>
                  );
                })}
              </div>
            </div>
          </div>
          {/* Selected day detail */}
          {selectedCalendarDate && (() => {
            const dayEvents = eventsByYMD.get(selectedCalendarDate) ?? [];
            const d = new Date(selectedCalendarDate + "T00:00:00");
            const dateLabel = d.toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" });
            return (
              <div className="mt-3 p-3 rounded-lg border border-neutral-200 dark:border-neutral-600 bg-neutral-50/50 dark:bg-neutral-800/30">
                <p className="text-xs font-semibold text-neutral-500 dark:text-neutral-400 uppercase tracking-wider mb-2">{dateLabel}</p>
                {dayEvents.length === 0 ? (
                  <p className="text-sm text-neutral-500 dark:text-neutral-400">No events</p>
                ) : (
                  <ul className="space-y-1.5">
                    {dayEvents.map((e) => {
                      const busy = manualPaidPendingId === e.id;
                      return (
                        <li
                          key={e.id}
                          className={`flex items-center justify-between gap-2 py-1.5 px-2 rounded text-sm ${calendarEventRowClass(e)}`}
                        >
                          <span className="flex items-center gap-2 min-w-0">
                            <span className={`shrink-0 rounded-full w-2.5 h-2.5 ${calendarEventDotClass(e)}`} />
                            <span className="truncate">{displayBillName(e.name)}</span>
                          </span>
                          <span className="flex items-center gap-2 shrink-0">
                            <RecurringMarkPaidButton
                              event={e}
                              busy={busy}
                              onToggle={() => void onMarkPaidClick(e)}
                            />
                            <span className="tabular-nums font-medium">
                              {e.type === "income" ? "+" : ""}
                              {formatCurrency(e.amount)}
                            </span>
                          </span>
                        </li>
                      );
                    })}
                  </ul>
                )}
              </div>
            );
          })()}
        </div>
      )}

      {/* List view: upcoming by account with Incoming / Outgoing */}
      {view === "list" && (
        <div className={getCardClasses(theme.summary)}>
          <h3 className="text-xs font-semibold text-neutral-500 dark:text-neutral-400 uppercase tracking-wider mb-3">
            {isCurrentMonth ? "Upcoming by account" : "All by account"}
          </h3>
          {ACCOUNT_ORDER.map((acct) => {
            const section = upcomingByAccount[acct];
            if (!section || (section.incoming.length === 0 && section.outgoing.length === 0)) return null;
            return (
              <div key={acct} className="mb-4 last:mb-0">
                <h4 className="text-sm font-medium text-neutral-800 dark:text-neutral-200 mb-2 flex items-center gap-2">
                  {accountLabel(acct)}
                </h4>
                <div className="space-y-3 pl-1 border-l-2 border-neutral-200 dark:border-neutral-700">
                  {section.incoming.length > 0 && (
                    <div>
                      <p className="text-[11px] font-medium text-emerald-600 dark:text-emerald-400 uppercase tracking-wider mb-1">Incoming</p>
                      <ul className="space-y-0.5">
                        {section.incoming.map((e) => {
                          const d = new Date(e.date + "T00:00:00");
                          const dateStr = d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
                          return (
                            <li key={e.id} className="flex items-center justify-between gap-2 py-1 sm:py-0.5 text-sm sm:text-xs">
                              <div className="flex items-center gap-2 sm:gap-1.5 min-w-0">
                                <span className={`w-3 h-3 sm:w-2 sm:h-2 rounded-full shrink-0 ${e.type === "income" ? "bg-emerald-500" : "bg-sky-500"}`} />
                                <span className="text-neutral-500 dark:text-neutral-400 shrink-0">{dateStr}</span>
                                <span className="text-neutral-900 dark:text-neutral-100 truncate" title={e.name}>{displayBillName(e.name)}</span>
                              </div>
                              <span className={`tabular-nums font-medium shrink-0 ${e.type === "income" ? "text-emerald-600 dark:text-emerald-400" : "text-sky-600 dark:text-sky-400"}`}>
                                {e.type === "income" ? "+" : ""}{formatCurrency(e.amount)}
                              </span>
                            </li>
                          );
                        })}
                      </ul>
                    </div>
                  )}
                  {section.outgoing.length > 0 && (
                    <div>
                      <p className="text-[11px] font-medium text-red-500 dark:text-red-400 uppercase tracking-wider mb-1">Outgoing</p>
                      <ul className="space-y-0.5">
                        {section.outgoing.map((e) => {
                          const d = new Date(e.date + "T00:00:00");
                          const dateStr = d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
                          const busy = manualPaidPendingId === e.id;
                          return (
                            <li key={e.id} className="flex items-center justify-between gap-2 py-1 sm:py-0.5 text-sm sm:text-xs">
                              <div className="flex items-center gap-2 sm:gap-1.5 min-w-0">
                                <span className={`w-3 h-3 sm:w-2 sm:h-2 rounded-full shrink-0 ${e.type === "transfer" ? "bg-sky-500" : "bg-red-400"}`} />
                                <span className="text-neutral-500 dark:text-neutral-400 shrink-0">{dateStr}</span>
                                <span className={`truncate ${e.isPaid ? "line-through text-neutral-500 dark:text-neutral-500" : "text-neutral-900 dark:text-neutral-100"}`} title={e.name}>
                                  {displayBillName(e.name)}
                                </span>
                              </div>
                              <div className="flex items-center gap-1.5 shrink-0">
                                <RecurringMarkPaidButton
                                  event={e}
                                  busy={busy}
                                  onToggle={() => void onMarkPaidClick(e)}
                                />
                                <span className={`tabular-nums font-medium ${e.type === "transfer" ? "text-sky-600 dark:text-sky-400" : "text-red-600 dark:text-red-400"}`}>
                                  {formatCurrency(e.amount)}
                                </span>
                              </div>
                            </li>
                          );
                        })}
                      </ul>
                    </div>
                  )}
                </div>
              </div>
            );
          })}
          {Object.keys(upcomingByAccount).length === 0 && (
            <p className="text-sm text-neutral-500 dark:text-neutral-400 text-center py-4">No upcoming items for this period.</p>
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
                      const busy = manualPaidPendingId === e.id;
                      return (
                        <tr key={e.id} className="border-b border-neutral-100 dark:border-neutral-800 last:border-0 opacity-60">
                          <td className="py-1.5 pr-2">
                            <div className="flex items-center gap-1.5">
                              <span className={`w-2 h-2 rounded-full shrink-0 ${e.type === "income" ? "bg-emerald-500" : e.type === "transfer" ? "bg-sky-500" : "bg-red-400"}`} />
                              <span className={`truncate max-w-[160px] ${e.isPaid ? "line-through text-neutral-500" : "text-neutral-900 dark:text-neutral-100"}`}>
                                {displayBillName(e.name)}
                              </span>
                            </div>
                          </td>
                          <td className="py-1.5 pr-2 text-neutral-500 dark:text-neutral-500 whitespace-nowrap">{dateStr}</td>
                          <td className="py-1.5 pr-2 text-neutral-500 dark:text-neutral-500 truncate max-w-[100px]">{accountLabel(e.account)}</td>
                          <td className="py-1.5 pr-1 text-right align-middle">
                            <div className="inline-flex justify-end">
                              <RecurringMarkPaidButton
                                event={e}
                                busy={busy}
                                onToggle={() => void onMarkPaidClick(e)}
                              />
                            </div>
                          </td>
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

      {/* Needed per account before next paycheck — click to show recurring items */}
      <div className={getCardClasses(theme.summary)}>
        <h3 className="text-xs font-semibold text-neutral-500 dark:text-neutral-400 uppercase tracking-wider mb-2">Needed before next paycheck</h3>
        <div className="space-y-0">
          {[
            { acct: "checking_account" as const, key: "checkingAccount" as const },
            { acct: "bills_account" as const, key: "billsAccount" as const },
            { acct: "spanish_fork" as const, key: "spanishFork" as const },
          ].map(({ acct, key }) => {
            const needed = requiredThisPaycheckByAccount[key] ?? 0;
            const items = key === "checkingAccount" ? neededBreakdown.checkingAccount : key === "billsAccount" ? neededBreakdown.billsAccount : neededBreakdown.spanishFork;
            const isOpen = neededBreakdownOpen === acct;
            return (
              <div key={acct} className="border-b border-neutral-100 dark:border-neutral-800 last:border-0">
                <button
                  type="button"
                  onClick={() => setNeededBreakdownOpen(isOpen ? null : acct)}
                  className="w-full flex items-center justify-between gap-2 py-2 text-left hover:bg-neutral-50 dark:hover:bg-neutral-800/50 rounded px-1 -mx-1"
                >
                  <span className={`text-sm font-medium ${neededAccountLabelClass(acct)}`}>{accountLabel(acct)}</span>
                  <span className={`text-sm tabular-nums font-medium ${needed > 0 ? "text-amber-600 dark:text-amber-400" : "text-neutral-500 dark:text-neutral-400"}`}>
                    {needed > 0 ? formatCurrency(needed) : "—"}
                  </span>
                </button>
                {isOpen && items.length > 0 && (
                  <div className="pb-2 pl-2 pr-2 space-y-1 border-t border-neutral-100 dark:border-neutral-800">
                    {items.map((item, i) => (
                      <div key={`${item.name}-${i}`} className="flex justify-between text-xs text-neutral-600 dark:text-neutral-400 py-0.5">
                        <span>{displayBillName(item.name)}</span>
                        <span className="tabular-nums">{formatCurrency(item.amount)}</span>
                      </div>
                    ))}
                  </div>
                )}
                {isOpen && items.length === 0 && (
                  <div className="pb-2 pl-2 text-xs text-neutral-500 dark:text-neutral-400 border-t border-neutral-100 dark:border-neutral-800">
                    No recurring items due before next paycheck.
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>

      {goalPickFor?.manualPaid && goalPickFor.manualPaid.goalCandidates.length >= 1 && (
        <div
          className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/40 overflow-y-auto"
          role="dialog"
          aria-modal="true"
          aria-labelledby="goal-pick-title"
        >
          <div
            className={
              getCardClasses(theme.summary) +
              " w-full max-w-sm shadow-xl p-4 space-y-3 my-auto"
            }
          >
            <h3 id="goal-pick-title" className="text-sm font-semibold text-neutral-900 dark:text-neutral-100">
              Which goal gets this payment?
            </h3>
            <p className="text-xs text-neutral-600 dark:text-neutral-400">
              {displayBillName(goalPickFor.name)} — choose which goal should receive this payment ({formatCurrency(goalPickFor.amount)}).
            </p>
            <select
              value={goalPickSelectedId}
              onChange={(ev) => setGoalPickSelectedId(ev.target.value)}
              className="w-full rounded-lg border border-neutral-300 dark:border-neutral-600 bg-white dark:bg-neutral-900 px-3 py-2 text-sm text-neutral-900 dark:text-neutral-100"
            >
              {goalPickFor.manualPaid.goalCandidates.map((g) => (
                <option key={g.id} value={g.id}>
                  {g.name}
                </option>
              ))}
            </select>
            <div className="flex justify-end gap-2 pt-1">
              <button
                type="button"
                onClick={() => setGoalPickFor(null)}
                className="rounded-lg border border-neutral-300 dark:border-neutral-600 px-3 py-2 text-sm text-neutral-700 dark:text-neutral-300"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={!goalPickSelectedId.trim() || manualPaidPendingId !== null}
                onClick={() => void confirmGoalPick()}
                className="rounded-lg bg-sky-600 px-3 py-2 text-sm font-medium text-white hover:bg-sky-500 disabled:opacity-50"
              >
                Mark paid
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
