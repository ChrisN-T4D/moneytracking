import type {
  PaycheckConfig,
  Section,
  SectionType,
  BillListAccount,
  BillListType,
  BillOrSub,
  AutoTransfer,
  SpanishForkBill,
  Summary,
  StatementRecord,
  StatementTagRule,
  StatementTagTargetType,
  MoneyGoal,
} from "./types";
import type { Frequency } from "./types";
import { getNextDueAndPaycheck, getTodayUTC, parseFlexibleDate, formatDateToYYYYMMDD } from "./paycheckDates";
import { getAdminToken } from "./pocketbase-setup";
import { isOklahomaMortgageBillName, OKLAHOMA_MORTGAGE_LABEL } from "./mortgageBillNames";

const POCKETBASE_URL = process.env.NEXT_PUBLIC_POCKETBASE_URL ?? "";
const POCKETBASE_API_URL = (process.env.POCKETBASE_API_URL ?? process.env.NEXT_PUBLIC_POCKETBASE_URL ?? "").trim();
// If URL ends with /_ or /_/, the API is often at the root (e.g. https://host.com/api/...).
// Use root for API calls so fetches work when the UI is at https://host.com/_/
const BASE = (() => {
  const b = POCKETBASE_URL.replace(/\/$/, "");
  if (b.endsWith("/_")) return b.replace(/\/_\/?$/, "") || b;
  return b;
})();

function pbFetch<T>(path: string): Promise<T> {
  return fetch(`${BASE}${path}`, { next: { revalidate: 60 } }).then((r) => {
    if (!r.ok) throw new Error(String(r.status));
    return r.json() as Promise<T>;
  });
}

interface PbListResponse<T> {
  items: T[];
  totalItems: number;
  page: number;
  perPage: number;
}

// --- Paychecks ---

type PbPaycheckItem = {
  id: string;
  name?: string;
  frequency?: string;
  anchordate?: string;
  dayOfMonth?: number;
  amount?: number;
  paidThisMonthYearMonth?: string | null;
  amountPaidThisMonth?: number | null;
  lastEditedByUserId?: string | null;
  lastEditedBy?: string | null;
  lastEditedAt?: string | null;
  fundingMonthPreference?: string | null;
};

/** Fetch paychecks from PocketBase. Uses admin auth when configured so List rules that require superusers succeed. Paychecks are shared; who edited is stored on each record. */
export async function getPaychecks(): Promise<PaycheckConfig[]> {
  if (!POCKETBASE_URL) return [];
  const apiBase = POCKETBASE_API_URL || BASE;
  const email = process.env.POCKETBASE_ADMIN_EMAIL ?? "";
  const password = process.env.POCKETBASE_ADMIN_PASSWORD ?? "";
  let url = `${BASE}/api/collections/paychecks/records`;
  const headers: Record<string, string> = {};
  if (apiBase && email && password) {
    try {
      const { token, baseUrl } = await getAdminToken(apiBase, email, password);
      url = `${baseUrl.replace(/\/$/, "")}/api/collections/paychecks/records`;
      headers.Authorization = `Bearer ${token}`;
    } catch {
      // fall back to unauthenticated
    }
  }
  try {
    const res = await fetch(url, { cache: "no-store", ...(Object.keys(headers).length > 0 ? { headers } : {}) });
    if (!res.ok) return [];
    const data = (await res.json()) as PbListResponse<PbPaycheckItem>;
    return (data.items ?? []).map((item) => {
      const freq = item.frequency ?? "";
      const frequency: PaycheckConfig["frequency"] =
        freq === "monthlyLastWorkingDay" ? "monthlyLastWorkingDay"
        : freq === "monthly" ? "monthly"
        : "biweekly";
      const anchorRaw = (item.anchordate ?? "").trim();
      let anchorDate: string | null = null;
      if (anchorRaw) {
        const dateOnly = anchorRaw.substring(0, 10);
        if (/^\d{4}-\d{2}-\d{2}$/.test(dateOnly)) anchorDate = dateOnly;
        else {
          const parsed = parseFlexibleDate(anchorRaw);
          anchorDate = !Number.isNaN(parsed.getTime()) ? formatDateToYYYYMMDD(parsed) : anchorRaw;
        }
      }
      const paidYm = item.paidThisMonthYearMonth?.trim() || null;
      const amtPaid = item.amountPaidThisMonth != null ? Number(item.amountPaidThisMonth) : null;
      const fmp = item.fundingMonthPreference;
      return {
        id: item.id,
        name: item.name ?? "",
        frequency,
        anchorDate,
        dayOfMonth: item.dayOfMonth ?? null,
        amount: item.amount ?? null,
        paidThisMonthYearMonth: paidYm,
        amountPaidThisMonth: amtPaid,
        fundingMonthPreference:
          fmp === "same_month" || fmp === "next_month" || fmp === "split" ? fmp : null,
        lastEditedBy: item.lastEditedBy ?? null,
        lastEditedAt: item.lastEditedAt ?? null,
        lastEditedByUserId: item.lastEditedByUserId ?? null,
      };
    });
  } catch {
    return [];
  }
}

// --- Sections ---

interface PbSection {
  id: string;
  sortOrder?: number;
  type?: string;
  title?: string;
  subtitle?: string | null;
  account?: string | null;
  listType?: string | null;
}

function parseSection(item: PbSection): Section {
  const type = (item.type ?? "bills_list") as SectionType;
  return {
    id: item.id,
    sortOrder: typeof item.sortOrder === "number" ? item.sortOrder : 0,
    type,
    title: item.title ?? "",
    subtitle: item.subtitle ?? null,
    account: (item.account as BillListAccount | undefined) ?? null,
    listType: (item.listType as BillListType | undefined) ?? null,
  };
}

/** Fetch sections from PocketBase, ordered by sortOrder. Returns [] if URL not set or request fails. */
export async function getSections(): Promise<Section[]> {
  if (!POCKETBASE_URL) return [];
  try {
    const data = await pbFetch<PbListResponse<PbSection>>(
      "/api/collections/sections/records?sort=sortOrder"
    );
    return (data.items ?? []).map(parseSection).sort((a, b) => a.sortOrder - b.sortOrder);
  } catch {
    return [];
  }
}

// --- Bills (BillOrSub) ---

interface PbBill {
  id: string;
  name?: string;
  frequency?: string;
  nextDue?: string;
  inThisPaycheck?: boolean;
  amount?: number;
  autoTransferNote?: string | null;
  account?: string;
  listType?: string;
  subsection?: string | null;
  recurringPaidCycle?: string | null;
  recurringPaidGoalId?: string | null;
  recurringPaidStatementId?: string | null;
}

function parseFrequency(s: string | undefined): Frequency {
  if (s === "2weeks" || s === "monthly" || s === "yearly") return s;
  return "monthly";
}

function parseBill(item: PbBill, paycheckEndDate?: Date | null): BillOrSub {
  const ref = getTodayUTC();
  const rawNextDue = (item.nextDue ?? "").trim();
  const recurringPaid = (item.recurringPaidCycle ?? "").trim() || null;
  const recurringGoal = (item.recurringPaidGoalId ?? "").trim() || null;
  const recurringStmt = (item.recurringPaidStatementId ?? "").trim() || null;
  if (!rawNextDue) {
    return {
      id: item.id,
      name: item.name ?? "",
      frequency: parseFrequency(item.frequency),
      nextDue: "",
      inThisPaycheck: false,
      amount: Number(item.amount) || 0,
      autoTransferNote: item.autoTransferNote ?? undefined,
      subsection: item.subsection ?? null,
      recurringPaidCycle: recurringPaid,
      recurringPaidGoalId: recurringGoal,
      recurringPaidStatementId: recurringStmt,
    };
  }
  const { nextDue, inThisPaycheck } = getNextDueAndPaycheck(
    rawNextDue,
    item.frequency ?? "monthly",
    ref,
    paycheckEndDate
  );
  return {
    id: item.id,
    name: item.name ?? "",
    frequency: parseFrequency(item.frequency),
    nextDue,
    inThisPaycheck,
    amount: Number(item.amount) || 0,
    autoTransferNote: item.autoTransferNote ?? undefined,
    subsection: item.subsection ?? null,
    recurringPaidCycle: recurringPaid,
    recurringPaidGoalId: recurringGoal,
    recurringPaidStatementId: recurringStmt,
  };
}

// Store account/listType on parsed items for filtering (PocketBase fields preserved in extended type)
export type BillOrSubWithMeta = BillOrSub & { account?: string; listType?: string; subsection?: string | null };

/** Fetch all bills/subscriptions from PocketBase (with account/listType for section filtering). */
export async function getBillsWithMeta(paycheckEndDate?: Date | null): Promise<BillOrSubWithMeta[]> {
  if (!POCKETBASE_URL) return [];
  const adminEmail = process.env.POCKETBASE_ADMIN_EMAIL ?? "";
  const adminPassword = process.env.POCKETBASE_ADMIN_PASSWORD ?? "";
  const adminApiBase = POCKETBASE_API_URL || BASE;

  function mapItems(items: PbBill[]): BillOrSubWithMeta[] {
    return (items ?? []).map((item) => {
      const b = parseBill(item, paycheckEndDate);
      return {
        ...b,
        account: item.account,
        listType: item.listType,
        subsection: item.subsection ?? b.subsection ?? null,
      } as BillOrSubWithMeta;
    });
  }

  try {
    if (adminApiBase && adminEmail && adminPassword) {
      try {
        const { token, baseUrl } = await getAdminToken(adminApiBase, adminEmail, adminPassword);
        const res = await fetch(`${baseUrl.replace(/\/$/, "")}/api/collections/bills/records?perPage=500`, {
          cache: "no-store",
          headers: { Authorization: `Bearer ${token}` },
        });
        if (res.ok) {
          const data = (await res.json()) as PbListResponse<PbBill>;
          return mapItems(data.items ?? []);
        }
      } catch {
        // fall through to unauthenticated
      }
    }
    // no-store so new subsections created in "Add items to bills" show as rows on the main page after refresh
    const res = await fetch(`${BASE}/api/collections/bills/records?perPage=500`, { cache: "no-store" });
    if (!res.ok) return [];
    const data = (await res.json()) as PbListResponse<PbBill>;
    return mapItems(data.items ?? []);
  } catch {
    return [];
  }
}

/** Get bills with meta filtered by account and listType. */
export function filterBillsWithMeta(
  bills: BillOrSubWithMeta[],
  account: BillListAccount,
  listType: BillListType
): BillOrSubWithMeta[] {
  return bills.filter((b) => b.account === account && b.listType === listType);
}

const GROUP_ID_PREFIX = "group-";

/** Normalize bill name for grouping so "OG & E (Electricity)" and "OG&E (Electricity)" merge. */
export function normalizeKeyForGrouping(name: string): string {
  const s = (name ?? "").toLowerCase().trim();
  return s.replace(/\s+/g, "").replace(/&/g, "");
}

/** Internal subsection value on grouped rows — must not be saved on new bills from "Add to group". */
export const OKLAHOMA_MORTGAGE_MERGE_SUBSECTION_KEY = "__oklahoma_mortgage__|merged" as const;

export function isSyntheticBillSubsectionKey(sub: string | undefined | null): boolean {
  const s = (sub ?? "").trim();
  return s === OKLAHOMA_MORTGAGE_MERGE_SUBSECTION_KEY || (s.startsWith("__") && s.endsWith("|merged"));
}

/** Stable group key — must match `groupBillsBySubsection` (used when aggregating paid/breakdown per row). */
export function billSubsectionGroupKey(b: BillOrSubWithMeta): string {
  if (b.subsection && b.subsection.trim()) {
    const base = b.subsection.trim();
    return `${base}|${b.name ?? b.id}`;
  }
  if (isOklahomaMortgageBillName(b.name ?? "")) {
    return OKLAHOMA_MORTGAGE_MERGE_SUBSECTION_KEY;
  }
  const base = normalizeKeyForGrouping(b.name);
  return `${base}|${b.name ?? b.id}`;
}

/**
 * Group bills by subsection (or by normalized name when subsection empty).
 * Returns grouped items and a map from group key to display name for aggregating paid/breakdown.
 */
export function groupBillsBySubsection(bills: BillOrSubWithMeta[]): {
  items: BillOrSub[];
  groupKeyToDisplayName: Map<string, string>;
  membersByGroupKey: Map<string, BillOrSubWithMeta[]>;
} {
  const byKey = new Map<string, BillOrSubWithMeta[]>();
  for (const b of bills) {
    const key = billSubsectionGroupKey(b);
    const list = byKey.get(key) ?? [];
    list.push(b);
    byKey.set(key, list);
  }
  const membersByGroupKey = new Map<string, BillOrSubWithMeta[]>();
  for (const [key, list] of byKey) {
    membersByGroupKey.set(key, list);
  }
  const groupKeyToDisplayName = new Map<string, string>();
  const result: BillOrSub[] = [];
  for (const [key, list] of byKey) {
    if (list.length === 0) continue;
    const first = list[0]!;
    const displayName =
      key === OKLAHOMA_MORTGAGE_MERGE_SUBSECTION_KEY || isOklahomaMortgageBillName(first.name ?? "")
        ? OKLAHOMA_MORTGAGE_LABEL
        : first.name;
    groupKeyToDisplayName.set(key, displayName);
    const amounts = list.map((b) => Number(b.amount) || 0);
    const totalAmount = amounts.reduce((a, b) => a + b, 0);
    const nextDues = list.map((b) => b.nextDue).filter((s) => s && s.trim());
    const earliestNextDue =
      nextDues.length > 0 ? nextDues.reduce((a, b) => (a < b ? a : b)) : "";
    const inThisPaycheck = list.some((b) => b.inThisPaycheck === true);
    const frequency = first.frequency ?? "monthly";
    const id =
      list.length === 1 ? first.id : `${GROUP_ID_PREFIX}${displayName}`;
    result.push({
      id,
      name: displayName,
      frequency,
      nextDue: earliestNextDue,
      inThisPaycheck,
      amount: totalAmount,
      autoTransferNote: list.length === 1 ? first.autoTransferNote : undefined,
      subsection: key,
    });
  }
  return { items: result, groupKeyToDisplayName, membersByGroupKey };
}

/** True if a BillOrSub id represents a grouped row (multiple bills under one subsection). */
export function isGroupedBillId(id: string): boolean {
  return id.startsWith(GROUP_ID_PREFIX);
}

// --- Auto transfers ---

interface PbAutoTransfer {
  id: string;
  whatFor?: string;
  frequency?: string;
  account?: string;
  date?: string;
  amount?: number;
  transferred_this_cycle?: boolean;
  transferredThisCycle?: boolean;
}

/** Fetch auto transfers from PocketBase. Returns [] if URL not set or request fails. */
export async function getAutoTransfers(): Promise<AutoTransfer[]> {
  if (!POCKETBASE_URL) return [];
  try {
    const data = await pbFetch<PbListResponse<PbAutoTransfer>>(
      "/api/collections/auto_transfers/records?perPage=200"
    );
    return (data.items ?? []).map((item) => ({
      id: item.id,
      whatFor: item.whatFor ?? "",
      frequency: item.frequency ?? "",
      account: item.account ?? "",
      date: item.date ?? "",
      amount: Number(item.amount) || 0,
      transferredThisCycle: Boolean(item.transferred_this_cycle ?? item.transferredThisCycle),
    }));
  } catch {
    return [];
  }
}

// --- Spanish Fork bills ---

interface PbSpanishForkBill {
  id: string;
  name?: string;
  frequency?: string;
  nextDue?: string;
  inThisPaycheck?: boolean;
  amount?: number;
  tenantPaid?: boolean;
  recurringPaidCycle?: string | null;
  recurringPaidGoalId?: string | null;
  recurringPaidStatementID?: string | null;
}

/** Fetch Spanish Fork bills from PocketBase. Returns [] if URL not set or request fails. */
export async function getSpanishForkBills(paycheckEndDate?: Date | null): Promise<SpanishForkBill[]> {
  if (!POCKETBASE_URL) return [];
  try {
    // Use admin auth so all records are returned regardless of collection rules
    const adminEmail = process.env.POCKETBASE_ADMIN_EMAIL ?? "";
    const adminPassword = process.env.POCKETBASE_ADMIN_PASSWORD ?? "";
    let fetchBase = BASE;
    let authHeader: Record<string, string> = {};
    if (adminEmail && adminPassword) {
      try {
        const r = await getAdminToken(POCKETBASE_API_URL || BASE, adminEmail, adminPassword);
        fetchBase = r.baseUrl.replace(/\/$/, "");
        authHeader = { Authorization: `Bearer ${r.token}` };
      } catch { /* fall through to unauthenticated */ }
    }
    // no-store so tenantPaid changes (e.g. cleared in PocketBase) show after refresh
    const res = await fetch(`${fetchBase}/api/collections/spanish_fork_bills/records?perPage=200`, {
      cache: "no-store",
      headers: authHeader,
    });
    if (!res.ok) return [];
    const data = (await res.json()) as PbListResponse<PbSpanishForkBill>;
    const ref = getTodayUTC();
    return (data.items ?? []).map((item) => {
      const { nextDue, inThisPaycheck } = getNextDueAndPaycheck(
        item.nextDue ?? "",
        item.frequency ?? "monthly",
        ref,
        paycheckEndDate
      );
      return {
        id: item.id,
        name: item.name ?? "",
        frequency: item.frequency ?? "",
        nextDue,
        inThisPaycheck,
        amount: Number(item.amount) || 0,
        tenantPaid: Boolean(item.tenantPaid),
        recurringPaidCycle: (item.recurringPaidCycle ?? "").trim() || null,
        recurringPaidGoalId: (item.recurringPaidGoalId ?? "").trim() || null,
        recurringPaidStatementId: (item.recurringPaidStatementID ?? "").trim() || null,
      };
    });
  } catch {
    return [];
  }
}

// --- Summary ---

interface PbSummary {
  id: string;
  monthlyTotal?: number;
  totalNeeded?: number;
  billsAccountNeeded?: number;
  checkingAccountNeeded?: number;
  spanishForkNeeded?: number;
  billsSubscriptions?: number;
  checkingSubscriptions?: number;
  leftOver?: number;
  leftOverPerPaycheck?: number;
  planToFamily?: string | null;
  checkingBalance?: number | null;
  billsBalance?: number | null;
  spanishForkBalance?: number | null;
  spanishForkTenantRentMonthly?: number | null;
}

/** Fetch summary (first record) from PocketBase. Returns null if URL not set or request fails. Uses admin auth when configured so balance fields are readable. */
export async function getSummary(): Promise<Summary | null> {
  if (!POCKETBASE_URL) return null;
  const adminEmail = process.env.POCKETBASE_ADMIN_EMAIL ?? "";
  const adminPassword = process.env.POCKETBASE_ADMIN_PASSWORD ?? "";
  const apiBaseUrl = POCKETBASE_API_URL || BASE;

  function parseSummaryItem(item: PbSummary): Summary {
    return {
      monthlyTotal: Number(item.monthlyTotal) || 0,
      totalNeeded: Number(item.totalNeeded) || 0,
      billsAccountNeeded: Number(item.billsAccountNeeded) || 0,
      checkingAccountNeeded: Number(item.checkingAccountNeeded) || 0,
      spanishForkNeeded: Number(item.spanishForkNeeded) || 0,
      billsSubscriptions: Number(item.billsSubscriptions) || 0,
      checkingSubscriptions: Number(item.checkingSubscriptions) || 0,
      leftOver: Number(item.leftOver) || 0,
      leftOverPerPaycheck: Number(item.leftOverPerPaycheck) || 0,
      planToFamily: item.planToFamily ?? "",
      checkingBalance: item.checkingBalance != null ? Number(item.checkingBalance) : null,
      billsBalance: item.billsBalance != null ? Number(item.billsBalance) : null,
      spanishForkBalance: item.spanishForkBalance != null ? Number(item.spanishForkBalance) : null,
      spanishForkTenantRentMonthly: item.spanishForkTenantRentMonthly != null ? Number(item.spanishForkTenantRentMonthly) : null,
    };
  }

  try {
    // Try admin auth first so restricted collections return balance fields
    if (apiBaseUrl && adminEmail && adminPassword) {
      try {
        const { token, baseUrl } = await getAdminToken(apiBaseUrl, adminEmail, adminPassword);
        const res = await fetch(`${baseUrl.replace(/\/$/, "")}/api/collections/summary/records?perPage=1`, {
          cache: "no-store",
          headers: { Authorization: `Bearer ${token}` },
        });
        if (res.ok) {
          const data = (await res.json()) as PbListResponse<PbSummary>;
          const item = data.items?.[0];
          if (item) return parseSummaryItem(item);
        }
      } catch {
        // fall through to unauthenticated
      }
    }
    // Fallback: unauthenticated
    const res = await fetch(`${BASE}/api/collections/summary/records?perPage=1`, { cache: "no-store" });
    if (!res.ok) return null;
    const data = (await res.json()) as PbListResponse<PbSummary>;
    const item = data.items?.[0];
    if (!item) return null;
    return parseSummaryItem(item);
  } catch {
    return null;
  }
}

// --- Money goals ---

interface PbGoal {
  id: string;
  name?: string;
  targetAmount?: number;
  currentAmount?: number;
  targetDate?: string | null;
  category?: string | null;
  monthlyContribution?: number | null;
}

/** Fetch money goals from PocketBase. Returns [] if URL not set or request fails. */
export async function getGoals(): Promise<MoneyGoal[]> {
  if (!POCKETBASE_URL) return [];
  try {
    // no-store so monthly contribution edits reflect immediately on router.refresh()
    const res = await fetch(`${BASE}/api/collections/goals/records?perPage=200`, { cache: "no-store" });
    if (!res.ok) return [];
    const data = (await res.json()) as PbListResponse<PbGoal>;
    return (data.items ?? []).map((item) => ({
      id: item.id,
      name: item.name ?? "",
      targetAmount: Number(item.targetAmount) || 0,
      currentAmount: Number(item.currentAmount) || 0,
      targetDate: item.targetDate ?? null,
      category: item.category ?? null,
      monthlyContribution: item.monthlyContribution != null ? Number(item.monthlyContribution) : null,
    }));
  } catch {
    return [];
  }
}

// --- Statements (CSV uploads) ---

interface PbStatement {
  id: string;
  date?: string;
  description?: string;
  amount?: number;
  balance?: number | null;
  category?: string | null;
  account?: string | null;
  sourceFile?: string | null;
  goalid?: string | null;
  pairedStatementId?: string | null;
  trasnferFromAccount?: string | null;
  transferToAccount?: string | null;
  targetType?: string | null;
  targetSection?: string | null;
  targetName?: string | null;
}

function mapStatementsResponse(items: PbStatement[]): StatementRecord[] {
  return (items ?? []).map((item) => {
    const raw = item as unknown as Record<string, unknown>;
    const str = (key: string) => {
      const v = raw[key];
      return v != null && String(v).trim() !== "" ? String(v).trim() : null;
    };
    return {
      id: item.id,
      date: String(raw.date ?? ""),
      description: String(raw.description ?? ""),
      amount: Number(raw.amount) || 0,
      balance: item.balance != null ? Number(item.balance) : null,
      category: item.category ?? null,
      account: item.account ?? null,
      sourceFile: str("sourceFile"),
      goalId: str("goalid"),
      pairedStatementId: str("pairedStatementId"),
      transferFromAccount: str("trasnferFromAccount"),
      transferToAccount: str("transferToAccount"),
      targetType: str("targetType") as StatementRecord["targetType"],
      targetSection: str("targetSection") as StatementRecord["targetSection"],
      targetName: str("targetName"),
    };
  });
}

/** Fetch statement records from PocketBase. Uses no-store so "Paid this month" and other statement-derived data stay fresh after refresh.
 *  When admin auth is configured, uses it so goalId is returned and goal progress on the main page updates. */
export async function getStatements(options?: {
  account?: string;
  perPage?: number;
  sort?: string;
}): Promise<StatementRecord[]> {
  if (!POCKETBASE_URL) return [];
  const params = new URLSearchParams();
  params.set("perPage", String(options?.perPage ?? 500));
  if (options?.sort) params.set("sort", options.sort);
  if (options?.account) params.set("filter", `account="${options.account}"`);
  const apiBase = POCKETBASE_API_URL || BASE;
  const email = process.env.POCKETBASE_ADMIN_EMAIL ?? "";
  const password = process.env.POCKETBASE_ADMIN_PASSWORD ?? "";
  try {
    if (apiBase && email && password) {
      try {
        const { token, baseUrl } = await getAdminToken(apiBase, email, password);
        const adminUrl = `${baseUrl.replace(/\/$/, "")}/api/collections/statements/records?${params}`;
        const res = await fetch(adminUrl, { cache: "no-store", headers: { Authorization: `Bearer ${token}` } });
        if (res.ok) {
          const data = (await res.json()) as PbListResponse<PbStatement>;
          return mapStatementsResponse(data.items ?? []);
        }
      } catch {
        // fall through to unauthenticated
      }
    }
    const url = `${BASE}/api/collections/statements/records?${params}`;
    const res = await fetch(url, { cache: "no-store" });
    if (!res.ok) return [];
    const data = (await res.json()) as PbListResponse<PbStatement>;
    return mapStatementsResponse(data.items ?? []);
  } catch {
    return [];
  }
}

// --- Statement tag rules (for tagging wizard) ---

interface PbStatementTagRule {
  id: string;
  pattern?: string;
  normalizedDescription?: string;
  targetType?: string;
  targetSection?: string | null;
  targetName?: string;
  goalId?: string | null;
  useCount?: number;
  overrideCount?: number;
}

function parsePbStatementTagRules(items: PbStatementTagRule[]): StatementTagRule[] {
  return items.map((item) => ({
    id: item.id,
    pattern: item.pattern ?? "",
    normalizedDescription: item.normalizedDescription ?? null,
    targetType: (item.targetType as StatementTagTargetType) ?? "ignore",
    targetSection:
      (item.targetSection as BillListAccount | "spanish_fork" | null) ?? null,
    targetName: item.targetName ?? null,
    goalId: item.goalId ?? null,
    useCount: item.useCount ?? 0,
    overrideCount: item.overrideCount ?? 0,
  }));
}

/** Fetch statement tagging rules from PocketBase. Returns [] if URL not set or request fails.
 *  Uses admin auth fallback if the collection requires auth to list. */
export async function getStatementTagRules(): Promise<StatementTagRule[]> {
  if (!POCKETBASE_URL) return [];
  try {
    // no-store so router.refresh() after saving tags picks up the new rules immediately
    const res = await fetch(`${BASE}/api/collections/statement_tag_rules/records?perPage=500`, { cache: "no-store" });
    if (res.ok) {
      const data = (await res.json()) as PbListResponse<PbStatementTagRule>;
      if ((data.items ?? []).length > 0) return parsePbStatementTagRules(data.items);
    }
    // Fallback: try with admin auth (collection may require auth to list)
    const adminEmail = process.env.POCKETBASE_ADMIN_EMAIL ?? "";
    const adminPassword = process.env.POCKETBASE_ADMIN_PASSWORD ?? "";
    if (!adminEmail || !adminPassword) return [];
    const { token, baseUrl } = await getAdminToken(POCKETBASE_API_URL || BASE, adminEmail, adminPassword);
    const adminBase = baseUrl.replace(/\/$/, "");
    const adminRes = await fetch(
      `${adminBase}/api/collections/statement_tag_rules/records?perPage=500`,
      { headers: { Authorization: `Bearer ${token}` }, cache: "no-store" }
    );
    if (!adminRes.ok) return [];
    const data = (await adminRes.json()) as PbListResponse<PbStatementTagRule>;
    return parsePbStatementTagRules(data.items ?? []);
  } catch {
    return [];
  }
}
