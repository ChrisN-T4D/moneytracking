import { NextResponse } from "next/server";
import { getAdminToken } from "@/lib/pocketbase-setup";
import { lookupBillAmount, lookupSpanishForkAmount } from "@/lib/budgetAmounts";

export const dynamic = "force-dynamic";

/** Same base URL logic as lib/pocketbase.ts: strip /_ so API is at root. */
function getApiBase(): string {
  const url = (process.env.POCKETBASE_API_URL ?? process.env.NEXT_PUBLIC_POCKETBASE_URL ?? "").trim();
  const b = url.replace(/\/$/, "");
  if (b.endsWith("/_")) return b.replace(/\/_\/?$/, "") || b;
  return b;
}

interface PbBill {
  id: string;
  name?: string;
  account?: string;
  listType?: string;
  amount?: number;
}

interface PbSpanishForkBill {
  id: string;
  name?: string;
  amount?: number;
}

/** Strip /_ or /_/ suffix so we always use the root API base (not the admin UI path). */
function stripAdminUiPath(base: string): string {
  return base.replace(/\/_\/?$/, "");
}

/** POST /api/update-bills-amounts — updates bill amounts in PocketBase from budget PDF data. Requires admin env. */
export async function POST() {
  const apiBase = getApiBase();
  const email = process.env.POCKETBASE_ADMIN_EMAIL ?? "";
  const password = process.env.POCKETBASE_ADMIN_PASSWORD ?? "";
  if (!apiBase || !email || !password) {
    return NextResponse.json(
      { ok: false, message: "POCKETBASE_API_URL and POCKETBASE_ADMIN_EMAIL / POCKETBASE_ADMIN_PASSWORD required." },
      { status: 400 }
    );
  }

  let token: string;
  let baseUrl: string;
  try {
    const result = await getAdminToken(apiBase, email, password);
    token = result.token;
    // Always strip /_  so we use root API path, not admin UI path
    baseUrl = stripAdminUiPath(result.baseUrl.replace(/\/$/, ""));
  } catch (e) {
    const errMsg = e instanceof Error ? e.message : String(e);
    return NextResponse.json(
      { ok: false, message: `Admin auth failed: ${errMsg}` },
      { status: 401 }
    );
  }

  const headers = {
    Authorization: `Bearer ${token}`,
    "Content-Type": "application/json",
  };
  let billsUpdated = 0;
  let sfUpdated = 0;
  const errors: string[] = [];

  try {
    const billsUrl = `${baseUrl}/api/collections/bills/records?perPage=500`;
    const billsRes = await fetch(billsUrl, { headers, cache: "no-store" });
    if (!billsRes.ok) {
      const message =
        billsRes.status === 404
          ? `Bills collection not found at ${baseUrl} (404). Go to /setup to create the bills and spanish_fork_bills collections, then try again.`
          : `Failed to list bills: ${billsRes.status} (URL: ${billsUrl})`;
      return NextResponse.json(
        { ok: false, message },
        { status: 502 }
      );
    }
    const billsData = (await billsRes.json()) as { items?: PbBill[] };
    const bills = billsData.items ?? [];

    for (const bill of bills) {
      const amount = lookupBillAmount(
        bill.account ?? "",
        bill.listType ?? "",
        bill.name ?? ""
      );
      if (amount === undefined) continue;
      const patchRes = await fetch(
        `${baseUrl}/api/collections/bills/records/${bill.id}`,
        {
          method: "PATCH",
          headers,
          body: JSON.stringify({ amount }),
        }
      );
      if (patchRes.ok) {
        billsUpdated++;
      } else {
        errors.push(`bills/${bill.id} (${bill.name}): ${patchRes.status}`);
      }
    }

    const sfRes = await fetch(
      `${baseUrl}/api/collections/spanish_fork_bills/records?perPage=200`,
      { headers, cache: "no-store" }
    );
    if (sfRes.ok) {
      const sfData = (await sfRes.json()) as { items?: PbSpanishForkBill[] };
      const sfBills = sfData.items ?? [];
      for (const bill of sfBills) {
        const amount = lookupSpanishForkAmount(bill.name ?? "");
        if (amount === undefined) continue;
        const patchRes = await fetch(
          `${baseUrl}/api/collections/spanish_fork_bills/records/${bill.id}`,
          {
            method: "PATCH",
            headers,
            body: JSON.stringify({ amount }),
          }
        );
        if (patchRes.ok) {
          sfUpdated++;
        } else {
          errors.push(`spanish_fork_bills/${bill.id} (${bill.name}): ${patchRes.status}`);
        }
      }
    }
  } catch (e) {
    return NextResponse.json(
      { ok: false, message: e instanceof Error ? e.message : "Request failed." },
      { status: 500 }
    );
  }

  return NextResponse.json({
    ok: true,
    billsUpdated,
    spanishForkUpdated: sfUpdated,
    ...(errors.length > 0 && { errors }),
  });
}
