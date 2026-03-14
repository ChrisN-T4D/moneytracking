import { NextResponse } from "next/server";
import { getPbBase } from "@/lib/pocketbase-auth";
import { getAdminToken } from "@/lib/pocketbase-setup";

export const dynamic = "force-dynamic";

const allowedFrequencies = ["2weeks", "monthly", "yearly"] as const;

/** PATCH /api/bills/update-by-name?name=...&account=...&listType=... — updates all bills matching name in that section. Body: { amount?, frequency?, nextDue? }. */
export async function PATCH(request: Request) {
  const base = getPbBase();
  if (!base) {
    return NextResponse.json({ ok: false, message: "PocketBase URL not configured." }, { status: 500 });
  }

  const url = new URL(request.url);
  const name = url.searchParams.get("name")?.trim();
  const account = url.searchParams.get("account")?.trim();
  const listType = url.searchParams.get("listType")?.trim();
  if (!name) return NextResponse.json({ ok: false, message: "name query param required." }, { status: 400 });
  if (!account) return NextResponse.json({ ok: false, message: "account query param required." }, { status: 400 });
  if (!listType) return NextResponse.json({ ok: false, message: "listType query param required." }, { status: 400 });

  let body: { amount?: number; frequency?: string; nextDue?: string };
  try {
    body = (await request.json().catch(() => ({}))) as typeof body;
  } catch {
    return NextResponse.json({ ok: false, message: "Invalid JSON body." }, { status: 400 });
  }

  const payload: Record<string, unknown> = {};
  if (body.amount !== undefined) {
    const n = Number(body.amount);
    if (Number.isNaN(n) || n < 0) {
      return NextResponse.json({ ok: false, message: "amount must be a non-negative number." }, { status: 400 });
    }
    payload.amount = n;
  }
  if (body.frequency !== undefined) {
    if (!allowedFrequencies.includes(body.frequency as (typeof allowedFrequencies)[number])) {
      return NextResponse.json({ ok: false, message: `frequency must be one of: ${allowedFrequencies.join(", ")}.` }, { status: 400 });
    }
    payload.frequency = body.frequency;
  }
  if (body.nextDue !== undefined) {
    payload.nextDue = String(body.nextDue ?? "").trim();
  }
  if (Object.keys(payload).length === 0) {
    return NextResponse.json({ ok: false, message: "Body must include at least one of: amount, frequency, nextDue." }, { status: 400 });
  }

  const apiBase = (process.env.POCKETBASE_API_URL ?? process.env.NEXT_PUBLIC_POCKETBASE_URL ?? "").trim() || base;
  let token: string;
  let resolvedBase: string;
  try {
    const r = await getAdminToken(apiBase, process.env.POCKETBASE_ADMIN_EMAIL ?? "", process.env.POCKETBASE_ADMIN_PASSWORD ?? "");
    token = r.token;
    resolvedBase = r.baseUrl.replace(/\/$/, "");
  } catch {
    return NextResponse.json({ ok: false, message: "Admin auth required." }, { status: 401 });
  }

  const filter = encodeURIComponent(`name="${name.replace(/"/g, '\\"')}" && account="${account.replace(/"/g, '\\"')}" && listType="${listType.replace(/"/g, '\\"')}"`);
  const listRes = await fetch(
    `${resolvedBase}/api/collections/bills/records?filter=${filter}&perPage=100`,
    { cache: "no-store", headers: { Authorization: `Bearer ${token}` } }
  );
  if (!listRes.ok) {
    return NextResponse.json({ ok: false, message: `Could not fetch bills: ${listRes.status}` }, { status: 502 });
  }
  const listData = (await listRes.json()) as { items?: { id: string }[] };
  const ids = (listData.items ?? []).map((b) => b.id);
  if (ids.length === 0) {
    return NextResponse.json({ ok: false, message: `No bills found matching name in this section.` }, { status: 404 });
  }

  let updated = 0;
  for (const id of ids) {
    const res = await fetch(`${resolvedBase}/api/collections/bills/records/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      body: JSON.stringify(payload),
    });
    if (res.ok) updated++;
  }
  const { revalidatePath } = await import("next/cache");
  revalidatePath("/");
  return NextResponse.json({ ok: true, updated });
}
