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
} from "./types";
import type { Frequency } from "./types";

const POCKETBASE_URL = process.env.NEXT_PUBLIC_POCKETBASE_URL ?? "";
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

export interface PaychecksResponse {
  items: Array<{
    id: string;
    name?: string;
    frequency?: string;
    anchorDate?: string;
    dayOfMonth?: number;
    amount?: number;
  }>;
  totalItems: number;
  page: number;
  perPage: number;
}

/** Fetch paychecks from PocketBase. Returns empty array if URL not set or request fails. */
export async function getPaychecks(): Promise<PaycheckConfig[]> {
  if (!POCKETBASE_URL) return [];
  try {
    const data = await pbFetch<PaychecksResponse>("/api/collections/paychecks/records");
    return (data.items ?? []).map((item) => {
      const freq = item.frequency as string;
      const frequency: PaycheckConfig["frequency"] =
        freq === "monthlyLastWorkingDay"
          ? "monthlyLastWorkingDay"
          : freq === "monthly"
            ? "monthly"
            : "biweekly";
      return {
        id: item.id,
        name: item.name ?? "",
        frequency,
        anchorDate: item.anchorDate ?? null,
        dayOfMonth: item.dayOfMonth ?? null,
        amount: item.amount ?? null,
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
}

/** Fetch statement records from PocketBase. */
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
    const data = await pbFetch<PbListResponse<PbStatement>>(
      `/api/collections/statements/records?${params}`
    );
    return (data.items ?? []).map((item) => ({
      id: item.id,
      date: item.date ?? "",
      description: item.description ?? "",
      amount: Number(item.amount) || 0,
      balance: item.balance != null ? Number(item.balance) : null,
      category: item.category ?? null,
      account: item.account ?? null,
      sourceFile: item.sourceFile ?? null,
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
    }));
  } catch {
    return [];
  }
}
