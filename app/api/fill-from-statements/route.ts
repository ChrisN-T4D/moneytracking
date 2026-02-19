import { NextResponse } from "next/server";
import { getStatements, getPaychecks, getAutoTransfers, getBillsWithMeta, getSpanishForkBills } from "@/lib/pocketbase";
import { getAdminToken } from "@/lib/pocketbase-setup";
import type { StatementRecord } from "@/lib/types";
import {
  suggestPaychecksFromStatements,
  suggestAutoTransfersFromStatements,
  suggestBillsFromStatements,
  suggestedPaycheckToRecord,
  suggestedAutoTransferToRecord,
  suggestedBillToRecord,
} from "@/lib/statementsAnalysis";

export const dynamic = "force-dynamic";

function getBaseUrl(): string {
  const url = (process.env.NEXT_PUBLIC_POCKETBASE_URL ?? "").replace(/\/$/, "");
  if (url.endsWith("/_")) return url.replace(/\/_\/?$/, "") || url;
  return url;
}

const baseUrlForAuth = () =>
  (process.env.POCKETBASE_API_URL ?? process.env.NEXT_PUBLIC_POCKETBASE_URL ?? "").trim();

/** Fetch statements; if 0 and admin env set, retry with admin auth (for restricted List rule). */
async function getStatementsForFill(): Promise<StatementRecord[]> {
  let statements = await getStatements({ perPage: 1000, sort: "-date" });
  if (statements.length > 0) return statements;

  const url = baseUrlForAuth();
  const email = process.env.POCKETBASE_ADMIN_EMAIL ?? "";
  const password = process.env.POCKETBASE_ADMIN_PASSWORD ?? "";
  if (!url || !email || !password) return statements;

  try {
    const { token, baseUrl } = await getAdminToken(url, email, password);
    const apiBase = baseUrl.replace(/\/$/, "");
    const res = await fetch(
      `${apiBase}/api/collections/statements/records?perPage=1000&sort=-date`,
      { headers: { Authorization: `Bearer ${token}` }, cache: "no-store" }
    );
    if (!res.ok) return statements;
    const data = (await res.json()) as { items?: Array<{ id: string; date?: string; description?: string; amount?: number; balance?: number | null; category?: string | null; account?: string | null; sourceFile?: string | null }> };
    statements = (data.items ?? []).map((item) => ({
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
    // keep statements as []
  }
  return statements;
}

/** GET: analyze statements and return suggested paychecks and auto_transfers. */
export async function GET() {
  const base = getBaseUrl();
  if (!base) {
    return NextResponse.json(
      { ok: false, message: "NEXT_PUBLIC_POCKETBASE_URL is not set." },
      { status: 400 }
    );
  }
  try {
    const statements = await getStatementsForFill();
    const paychecks = suggestPaychecksFromStatements(statements);
    const autoTransfers = suggestAutoTransfersFromStatements(statements);
    const bills = suggestBillsFromStatements(statements);
    return NextResponse.json({
      ok: true,
      statementsCount: statements.length,
      paychecks,
      autoTransfers,
      bills,
    });
  } catch (e) {
    return NextResponse.json(
      { ok: false, message: e instanceof Error ? e.message : String(e) },
      { status: 500 }
    );
  }
}

/** Resolve API base and optional admin auth for creating records (so Create rules can require auth). */
async function getCreateAuth(): Promise<{ apiBase: string; headers: Record<string, string> }> {
  const base = getBaseUrl();
  const apiBase = (baseUrlForAuth() || base).replace(/\/$/, "");
  const email = process.env.POCKETBASE_ADMIN_EMAIL ?? "";
  const password = process.env.POCKETBASE_ADMIN_PASSWORD ?? "";
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  if (apiBase && email && password) {
    try {
      const { token, baseUrl } = await getAdminToken(apiBase, email, password);
      const resolvedBase = baseUrl.replace(/\/$/, "");
      return { apiBase: resolvedBase, headers: { ...headers, Authorization: `Bearer ${token}` } };
    } catch {
      // fall back to no auth
    }
  }
  return { apiBase: apiBase || getBaseUrl(), headers };
}

/** POST: create suggested paychecks and/or auto_transfers in PocketBase. */
export async function POST(request: Request) {
  const base = getBaseUrl();
  if (!base) {
    return NextResponse.json(
      { ok: false, message: "NEXT_PUBLIC_POCKETBASE_URL is not set." },
      { status: 400 }
    );
  }
  try {
    const body = (await request.json()) as {
      createPaychecks?: boolean;
      paychecks?: Array<{ name: string; frequency: string; anchorDate: string; amount: number; count?: number; lastDate?: string }>;
      createAutoTransfers?: boolean;
      createBills?: boolean;
      bills?: Array<{
        name: string;
        frequency: string;
        amount: number;
        count?: number;
        lastDate?: string;
        section?: "bills_account" | "checking_account" | "spanish_fork";
        listType?: "bills" | "subscriptions";
      }>;
    };
    const createPaychecks = body.createPaychecks === true;
    const selectedPaychecks = Array.isArray(body.paychecks) ? body.paychecks : [];
    const createAutoTransfers = body.createAutoTransfers === true;
    const createBills = body.createBills === true;
    const selectedBills = Array.isArray(body.bills) ? body.bills : [];

    const { apiBase, headers: createHeaders } = await getCreateAuth();

    const existingPaychecks = await getPaychecks();
    const existingAutoTransfers = await getAutoTransfers();
    const existingBills = await getBillsWithMeta();
    const existingSpanishForkBills = await getSpanishForkBills();
    const existingPaycheckNames = new Set(existingPaychecks.map((p) => p.name?.toLowerCase().trim()).filter(Boolean));
    const existingWhatFors = new Set(existingAutoTransfers.map((a) => a.whatFor?.toLowerCase().trim()).filter(Boolean));
    const existingBillNames = new Set(existingBills.map((b) => b.name?.toLowerCase().trim()).filter(Boolean));
    const existingSpanishForkNames = new Set(existingSpanishForkBills.map((b) => b.name?.toLowerCase().trim()).filter(Boolean));

    let paychecksCreated = 0;
    let autoTransfersCreated = 0;
    let billsCreated = 0;

    const now = new Date();
    const currentYearMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
    // For last-working-day paychecks received this month, store paidThisMonthYearMonth as THIS month
    // (the billing-month shift is applied on read in page.tsx, so storage stays as the pay month).
    if (createPaychecks && selectedPaychecks.length > 0) {
      for (const s of selectedPaychecks) {
        if (existingPaycheckNames.has(s.name.toLowerCase().trim())) continue;
        const baseRecord = suggestedPaycheckToRecord(s as Parameters<typeof suggestedPaycheckToRecord>[0]);
        const record = {
          ...baseRecord,
          amountPaidThisMonth: s.amount,
          paidThisMonthYearMonth: currentYearMonth,
        };
        const res = await fetch(`${apiBase}/api/collections/paychecks/records`, {
          method: "POST",
          headers: createHeaders,
          body: JSON.stringify(record),
        });
        if (res.ok) {
          paychecksCreated++;
          existingPaycheckNames.add(s.name.toLowerCase().trim());
        }
      }
    }

    if (createAutoTransfers) {
      const statements = await getStatementsForFill();
      const suggestedAutoTransfers = suggestAutoTransfersFromStatements(statements);
      for (const s of suggestedAutoTransfers) {
        if (existingWhatFors.has(s.whatFor.toLowerCase().trim())) continue;
        const res = await fetch(`${apiBase}/api/collections/auto_transfers/records`, {
          method: "POST",
          headers: createHeaders,
          body: JSON.stringify(suggestedAutoTransferToRecord(s)),
        });
        if (res.ok) {
          autoTransfersCreated++;
          existingWhatFors.add(s.whatFor.toLowerCase().trim());
        }
      }
    }

    if (createBills && selectedBills.length > 0) {
      const section = (s: (typeof selectedBills)[0]) => s.section ?? "checking_account";
      const listType = (s: (typeof selectedBills)[0]) => s.listType ?? "bills";
      for (const s of selectedBills) {
        const sec = section(s);
        const freq = s.frequency === "2weeks" || s.frequency === "yearly" ? s.frequency : "monthly";
        const nextDue = s.lastDate || new Date().toISOString().slice(0, 10);

        if (sec === "spanish_fork") {
          if (existingSpanishForkNames.has(s.name.toLowerCase().trim())) continue;
          const sfRecord = {
            name: s.name,
            frequency: freq,
            nextDue,
            inThisPaycheck: false,
            amount: s.amount,
            tenantPaid: null,
          };
          const res = await fetch(`${apiBase}/api/collections/spanish_fork_bills/records`, {
            method: "POST",
            headers: createHeaders,
            body: JSON.stringify(sfRecord),
          });
          if (res.ok) {
            billsCreated++;
            existingSpanishForkNames.add(s.name.toLowerCase().trim());
          }
        } else {
          if (existingBillNames.has(s.name.toLowerCase().trim())) continue;
          const account = sec === "bills_account" ? "bills_account" : "checking_account";
          const lt = listType(s);
          const billRecord = suggestedBillToRecord(
            { name: s.name, frequency: freq, amount: s.amount, count: s.count ?? 0, lastDate: s.lastDate ?? "" },
            account,
            lt
          );
          const res = await fetch(`${apiBase}/api/collections/bills/records`, {
            method: "POST",
            headers: createHeaders,
            body: JSON.stringify(billRecord),
          });
          if (res.ok) {
            billsCreated++;
            existingBillNames.add(s.name.toLowerCase().trim());
          }
        }
      }
    }

    const parts = [];
    if (paychecksCreated) parts.push(`${paychecksCreated} paychecks`);
    if (autoTransfersCreated) parts.push(`${autoTransfersCreated} auto-transfers`);
    if (billsCreated) parts.push(`${billsCreated} bills`);
    return NextResponse.json({
      ok: true,
      message: parts.length ? `Created ${parts.join(", ")}.` : "Nothing created.",
      paychecksCreated,
      autoTransfersCreated,
      billsCreated,
    });
  } catch (e) {
    return NextResponse.json(
      { ok: false, message: e instanceof Error ? e.message : String(e) },
      { status: 500 }
    );
  }
}
