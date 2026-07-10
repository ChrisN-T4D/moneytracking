import { NextResponse } from "next/server";
import { getPbBase, getPbWriteToken } from "@/lib/pocketbase-auth";
import { paycheckAmountOverrideKey } from "@/lib/paycheckAmountOverride";
import { oklahomaMortgagePocketBaseNameVariants, pocketBaseBillsFilterByNamesAndAccount, pocketBaseBillsFilterByNamesAndSection } from "@/lib/mortgageBillNames";
import { normalizeKeyForGrouping } from "@/lib/pocketbase";
import { ensurePaycheckOverrideFields } from "@/lib/ensurePbPaycheckOverrideFields";

export const dynamic = "force-dynamic";

type Body = {
  name?: string;
  account?: string;
  listType?: string;
  nextPaydayYmd?: string;
  /** null clears override for this paycheck round */
  amount?: number | null;
  billIds?: string[];
  collection?: "bills" | "spanish_fork_bills";
};

/** PATCH — set or clear a one-paycheck amount override for a bill by name. */
export async function PATCH(request: Request) {
  const base = getPbBase();
  if (!base) {
    return NextResponse.json({ ok: false, message: "PocketBase URL not configured." }, { status: 500 });
  }

  let body: Body;
  try {
    body = (await request.json()) as Body;
  } catch {
    return NextResponse.json({ ok: false, message: "Invalid JSON body." }, { status: 400 });
  }

  const name = (body.name ?? "").trim();
  const account = (body.account ?? "").trim();
  const listType = (body.listType ?? "").trim();
  const nextPaydayYmd = (body.nextPaydayYmd ?? "").trim().slice(0, 10);

  if (!name) return NextResponse.json({ ok: false, message: "name is required." }, { status: 400 });
  if (!nextPaydayYmd || !/^\d{4}-\d{2}-\d{2}$/.test(nextPaydayYmd)) {
    return NextResponse.json({ ok: false, message: "nextPaydayYmd must be YYYY-MM-DD." }, { status: 400 });
  }
  if (body.amount !== null && body.amount !== undefined) {
    const n = Number(body.amount);
    if (Number.isNaN(n) || n < 0) {
      return NextResponse.json({ ok: false, message: "amount must be a non-negative number or null." }, { status: 400 });
    }
  }

  const auth = await getPbWriteToken(base);
  if (!auth) {
    return NextResponse.json(
      { ok: false, message: "Sign in or set PocketBase admin credentials." },
      { status: 401 }
    );
  }

  await ensurePaycheckOverrideFields(base);

  const overrideKey = paycheckAmountOverrideKey(nextPaydayYmd);
  const payload: Record<string, unknown> =
    body.amount === null || body.amount === undefined
      ? { paycheckAmountOverride: null, paycheckAmountOverrideFor: null }
      : { paycheckAmountOverride: Number(body.amount), paycheckAmountOverrideFor: overrideKey };

  const isSpanishFork =
    body.collection === "spanish_fork_bills" ||
    account === "spanish_fork" ||
    account === "spanish fork";
  let ids: string[] = [];

  const requestedIds = (body.billIds ?? []).filter((id) => /^[a-z0-9]{15}$/.test(id));
  if (requestedIds.length > 0) {
    ids = [...new Set(requestedIds)];
  } else if (isSpanishFork) {
    const norm = normalizeKeyForGrouping(name);
    const filter = encodeURIComponent(`name != ""`);
    const listRes = await fetch(
      `${auth.apiBase}/api/collections/spanish_fork_bills/records?filter=${filter}&perPage=200`,
      { cache: "no-store", headers: { Authorization: `Bearer ${auth.token}` } }
    );
    if (!listRes.ok) {
      return NextResponse.json({ ok: false, message: `Could not fetch Spanish Fork bills: ${listRes.status}` }, { status: 502 });
    }
    const listData = (await listRes.json()) as { items?: { id: string; name?: string }[] };
    ids = (listData.items ?? [])
      .filter((r) => normalizeKeyForGrouping((r.name ?? "").trim()) === norm)
      .map((r) => r.id);
  } else {
    if (!account) return NextResponse.json({ ok: false, message: "account is required for non–Spanish Fork bills." }, { status: 400 });

    const nameVariants = oklahomaMortgagePocketBaseNameVariants(name);
    const filter = encodeURIComponent(
      listType
        ? pocketBaseBillsFilterByNamesAndSection(nameVariants, account, listType)
        : pocketBaseBillsFilterByNamesAndAccount(nameVariants, account)
    );
    const listRes = await fetch(
      `${auth.apiBase}/api/collections/bills/records?filter=${filter}&perPage=100`,
      { cache: "no-store", headers: { Authorization: `Bearer ${auth.token}` } }
    );
    if (!listRes.ok) {
      return NextResponse.json({ ok: false, message: `Could not fetch bills: ${listRes.status}` }, { status: 502 });
    }
    const listData = (await listRes.json()) as { items?: { id: string }[] };
    ids = (listData.items ?? []).map((b) => b.id);
  }

  if (ids.length === 0) {
    return NextResponse.json({ ok: false, message: "No matching bill found." }, { status: 404 });
  }

  const collection =
    body.collection === "spanish_fork_bills" || isSpanishFork ? "spanish_fork_bills" : "bills";
  let updated = 0;
  let lastError = "";
  for (const id of [...new Set(ids)]) {
    const res = await fetch(`${auth.apiBase}/api/collections/${collection}/records/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${auth.token}` },
      body: JSON.stringify(payload),
    });
    if (res.ok) {
      updated++;
    } else {
      lastError = await res.text().catch(() => "");
    }
  }

  if (updated === 0) {
    const hint = lastError.toLowerCase().includes("paycheckamountoverride")
      ? " PocketBase may be missing paycheckAmountOverride fields — check admin credentials in .env.local."
      : "";
    return NextResponse.json(
      {
        ok: false,
        message: `Could not save override.${hint} ${lastError.slice(0, 180)}`.trim(),
      },
      { status: 502 }
    );
  }

  const { revalidatePath } = await import("next/cache");
  revalidatePath("/");
  return NextResponse.json({ ok: true, updated });
}
