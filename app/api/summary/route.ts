import { NextResponse } from "next/server";
import { getTokenFromCookie, getPbBase } from "@/lib/pocketbase-auth";
import { getAdminToken } from "@/lib/pocketbase-setup";

export const dynamic = "force-dynamic";

/** PATCH /api/summary — update account balance fields on the first summary record. */
export async function PATCH(request: Request) {
  const base = getPbBase();
  if (!base) {
    return NextResponse.json({ ok: false, message: "PocketBase URL not configured." }, { status: 500 });
  }

  let body: { checkingBalance?: number | null; billsBalance?: number | null; spanishForkBalance?: number | null; spanishForkTenantRentMonthly?: number | null };
  try {
    body = (await request.json()) as typeof body;
  } catch {
    return NextResponse.json({ ok: false, message: "Invalid JSON body." }, { status: 400 });
  }

  let authToken: string | null = null;
  let apiBase = base;

  // Prefer admin auth when configured — more reliable than cookie token which may be stale
  const email = process.env.POCKETBASE_ADMIN_EMAIL ?? "";
  const password = process.env.POCKETBASE_ADMIN_PASSWORD ?? "";
  if (email && password) {
    try {
      const r = await getAdminToken(base, email, password);
      authToken = r.token;
      apiBase = r.baseUrl;
    } catch { /* fall through to cookie */ }
  }

  // Fall back to cookie token if admin auth not configured or failed
  if (!authToken) {
    authToken = (await getTokenFromCookie().catch(() => null)) ?? null;
  }

  if (!authToken) {
    return NextResponse.json({ ok: false, message: "Not authenticated." }, { status: 401 });
  }

  // Find the first summary record id
  const listRes = await fetch(`${apiBase.replace(/\/$/, "")}/api/collections/summary/records?perPage=1`, {
    headers: { Authorization: `Bearer ${authToken}` },
    cache: "no-store",
  });
  if (!listRes.ok) {
    return NextResponse.json({ ok: false, message: `Could not fetch summary: ${listRes.status}` }, { status: 502 });
  }
  const listData = (await listRes.json()) as { items?: { id: string }[] };
  const id = listData.items?.[0]?.id;
  if (!id) {
    return NextResponse.json({ ok: false, message: "No summary record found." }, { status: 404 });
  }

  const payload: Record<string, unknown> = {};
  if (body.checkingBalance !== undefined) payload.checkingBalance = body.checkingBalance ?? null;
  if (body.billsBalance !== undefined) payload.billsBalance = body.billsBalance ?? null;
  if (body.spanishForkBalance !== undefined) payload.spanishForkBalance = body.spanishForkBalance ?? null;
  if (body.spanishForkTenantRentMonthly !== undefined) payload.spanishForkTenantRentMonthly = body.spanishForkTenantRentMonthly ?? null;

  if (Object.keys(payload).length === 0) {
    return NextResponse.json({ ok: false, message: "No fields to update." }, { status: 400 });
  }

  const res = await fetch(`${apiBase.replace(/\/$/, "")}/api/collections/summary/records/${id}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${authToken}` },
    body: JSON.stringify(payload),
    cache: "no-store",
  });
  if (!res.ok) {
    const text = await res.text();
    return NextResponse.json({ ok: false, message: `Update failed: ${res.status} ${text}` }, { status: 502 });
  }

  return NextResponse.json({ ok: true });
}
