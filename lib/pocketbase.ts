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
import { getAdminToken } from "./pocketbase-setup";

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

// --- Paychecks (existing) ---

/** PocketBase returns snake_case in API; we support both for paychecks. */
type PbPaycheckItem = {
  id: string;
  name?: string;
  frequency?: string;
  anchorDate?: string;
  dayOfMonth?: number;
  amount?: number;
  paidThisMonthYearMonth?: string | null;
  amountPaidThisMonth?: number | null;
  paid_this_month_year_month?: string | null;
  amount_paid_this_month?: number | null;
  lastEditedByUserId?: string | null;
  lastEditedBy?: string | null;
  lastEditedAt?: string | null;
  last_edited_by_user_id?: string | null;
  last_edited_by?: string | null;
  last_edited_at?: string | null;
};

export interface PaychecksResponse {
  items: PbPaycheckItem[];
  totalItems: number;
  page: number;
  perPage: number;
}

/** Find value in object by key normalized to lowercase no-underscores (e.g. amount_paid_this_month -> amountpaidthismonth). */
function getByNormalizedKey(obj: Record<string, unknown>, normalized: string): unknown {
  const want = normalized.toLowerCase().replace(/_/g, "");
  for (const key of Object.keys(obj)) {
    if (key.toLowerCase().replace(/_/g, "") === want) return obj[key];
  }
  return undefined;
}

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
    const data = (await res.json()) as PaychecksResponse;
    return (data.items ?? []).map((item) => {
      const freq = item.frequency as string;
      const frequency: PaycheckConfig["frequency"] =
        freq === "monthlyLastWorkingDay"
          ? "monthlyLastWorkingDay"
          : freq === "monthly"
            ? "monthly"
            : "biweekly";
      const raw = item as Record<string, unknown>;
      const paidThisMonthYearMonthRaw =
        raw.paidThisMonthYearMonth ?? raw.paid_this_month_year_month ?? getByNormalizedKey(raw, "paidThisMonthYearMonth");
      const paidThisMonthYearMonth =
        paidThisMonthYearMonthRaw != null && String(paidThisMonthYearMonthRaw).trim() !== ""
          ? String(paidThisMonthYearMonthRaw).trim()
          : null;
      const amountPaidThisMonthRaw =
        raw.amountPaidThisMonth ?? raw.amount_paid_this_month ?? getByNormalizedKey(raw, "amountPaidThisMonth");
      const amountPaidThisMonth =
        amountPaidThisMonthRaw != null && amountPaidThisMonthRaw !== ""
          ? Number(amountPaidThisMonthRaw)
          : null;
      const rawItem = item as Record<string, unknown>;
      const lastEditedBy = (rawItem.lastEditedBy ?? rawItem.last_edited_by) as string | null | undefined;
      const lastEditedAt = (rawItem.lastEditedAt ?? rawItem.last_edited_at) as string | null | undefined;
      const lastEditedByUserId = (rawItem.lastEditedByUserId ?? rawItem.last_edited_by_user_id) as string | null | undefined;
      const anchorDateRaw = (rawItem.anchorDate ?? rawItem.anchor_date ?? getByNormalizedKey(rawItem, "anchorDate")) as string | null | undefined;
      const anchorDate = anchorDateRaw != null && String(anchorDateRaw).trim() !== "" ? String(anchorDateRaw).trim() : null;
      return {
        id: item.id,
        name: item.name ?? "",
        frequency,
        anchorDate,
        dayOfMonth: item.dayOfMonth ?? null,
        amount: item.amount ?? null,
        paidThisMonthYearMonth,
        amountPaidThisMonth,
        lastEditedBy: lastEditedBy ?? null,
        lastEditedAt: lastEditedAt ?? null,
        lastEditedByUserId: lastEditedByUserId ?? null,
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
}

function parseFrequency(s: string | undefined): Frequency {
  if (s === "2weeks" || s === "monthly" || s === "yearly") return s;
  return "monthly";
}

function parseBill(item: PbBill): BillOrSub {
  return {
    id: item.id,
    name: item.name ?? "",
    frequency: parseFrequency(item.frequency),
    nextDue: item.nextDue ?? "",
    inThisPaycheck: Boolean(item.inThisPaycheck),
    amount: Number(item.amount) || 0,
    autoTransferNote: item.autoTransferNote ?? undefined,
    subsection: item.subsection ?? null,
  };
}

// Store account/listType on parsed items for filtering (PocketBase fields preserved in extended type)
export type BillOrSubWithMeta = BillOrSub & { account?: string; listType?: string; subsection?: string | null };

/** Fetch all bills/subscriptions from PocketBase (with account/listType for section filtering). */
export async function getBillsWithMeta(): Promise<BillOrSubWithMeta[]> {
  if (!POCKETBASE_URL) return [];
  try {
    const data = await pbFetch<PbListResponse<PbBill>>(
      "/api/collections/bills/records?perPage=500"
    );
    return (data.items ?? []).map((item) => {
      const b = parseBill(item);
      return {
        ...b,
        account: item.account,
        listType: item.listType,
        subsection: item.subsection ?? b.subsection ?? null,
      } as BillOrSubWithMeta;
    });
  } catch {
    return [];
  }
}

/** Get bills with meta filtered by account and listType. */
export function filterBillsWithMeta(
  bills: BillOrSubWithMeta[],
  account: BillListAccount,
  listType: BillListType
): BillOrSub[] {
  return bills.filter((b) => b.account === account && b.listType === listType);
}

// --- Auto transfers ---

interface PbAutoTransfer {
  id: string;
  whatFor?: string;
  frequency?: string;
  account?: string;
  date?: string;
  amount?: number;
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
  tenantPaid?: number | null;
}

/** Fetch Spanish Fork bills from PocketBase. Returns [] if URL not set or request fails. */
export async function getSpanishForkBills(): Promise<SpanishForkBill[]> {
  if (!POCKETBASE_URL) return [];
  try {
    const data = await pbFetch<PbListResponse<PbSpanishForkBill>>(
      "/api/collections/spanish_fork_bills/records?perPage=200"
    );
    return (data.items ?? []).map((item) => ({
      id: item.id,
      name: item.name ?? "",
      frequency: item.frequency ?? "",
      nextDue: item.nextDue ?? "",
      inThisPaycheck: Boolean(item.inThisPaycheck),
      amount: Number(item.amount) || 0,
      tenantPaid: item.tenantPaid != null ? Number(item.tenantPaid) : null,
    }));
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
}

/** Fetch summary (first record) from PocketBase. Returns null if URL not set or request fails. */
export async function getSummary(): Promise<Summary | null> {
  if (!POCKETBASE_URL) return null;
  try {
    const data = await pbFetch<PbListResponse<PbSummary>>(
      "/api/collections/summary/records?perPage=1"
    );
    const item = data.items?.[0];
    if (!item) return null;
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
    };
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
}

/** Fetch money goals from PocketBase. Returns [] if URL not set or request fails. */
export async function getGoals(): Promise<MoneyGoal[]> {
  if (!POCKETBASE_URL) return [];
  try {
    const data = await pbFetch<PbListResponse<PbGoal>>(
      "/api/collections/goals/records?perPage=200"
    );
    return (data.items ?? []).map((item) => ({
      id: item.id,
      name: item.name ?? "",
      targetAmount: Number(item.targetAmount) || 0,
      currentAmount: Number(item.currentAmount) || 0,
      targetDate: item.targetDate ?? null,
      category: item.category ?? null,
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
   goalId?: string | null;
}

/** Fetch statement records from PocketBase. Uses no-store so "Paid this month" and other statement-derived data stay fresh after refresh. */
export async function getStatements(options?: {
  account?: string;
  perPage?: number;
  sort?: string;
}): Promise<StatementRecord[]> {
  if (!POCKETBASE_URL) return [];
  try {
    const params = new URLSearchParams();
    params.set("perPage", String(options?.perPage ?? 500));
    if (options?.sort) params.set("sort", options.sort);
    if (options?.account) params.set("filter", `account="${options.account}"`);
    const res = await fetch(`${BASE}/api/collections/statements/records?${params}`, { cache: "no-store" });
    if (!res.ok) return [];
    const data = (await res.json()) as PbListResponse<PbStatement>;
    return (data.items ?? []).map((item) => ({
      id: item.id,
      date: item.date ?? "",
      description: item.description ?? "",
      amount: Number(item.amount) || 0,
      balance: item.balance != null ? Number(item.balance) : null,
      category: item.category ?? null,
      account: item.account ?? null,
      sourceFile: item.sourceFile ?? null,
      goalId: item.goalId ?? null,
    }));
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

/** Fetch statement tagging rules from PocketBase. Returns [] if URL not set or request fails. */
export async function getStatementTagRules(): Promise<StatementTagRule[]> {
  if (!POCKETBASE_URL) return [];
  try {
    const data = await pbFetch<PbListResponse<PbStatementTagRule>>(
      "/api/collections/statement_tag_rules/records?perPage=200"
    );
    return (data.items ?? []).map((item) => ({
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
  } catch {
    return [];
  }
}
