import { NextResponse } from "next/server";
import { getTokenFromCookie, getPbBase, getUserIdFromToken } from "@/lib/pocketbase-auth";
import { getAdminToken } from "@/lib/pocketbase-setup";

export const dynamic = "force-dynamic";

type PaycheckUpdateBody = {
  name?: string;
  frequency?: string;
  anchorDate?: string | null;
  dayOfMonth?: number | null;
  amount?: number | null;
  paidThisMonthYearMonth?: string | null;
  amountPaidThisMonth?: number | null;
};

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const base = getPbBase();
  if (!base) {
    return NextResponse.json(
      { ok: false, message: "PocketBase URL not configured." },
      { status: 500 }
    );
  }

  // Prefer admin auth when configured; fall back to cookie token
  let token: string | null = null;
  let resolvedBase = base;
  const adminEmail = process.env.POCKETBASE_ADMIN_EMAIL ?? "";
  const adminPassword = process.env.POCKETBASE_ADMIN_PASSWORD ?? "";
  if (adminEmail && adminPassword) {
    try {
      const r = await getAdminToken(base, adminEmail, adminPassword);
      token = r.token;
      resolvedBase = r.baseUrl.replace(/\/$/, "");
    } catch { /* fall through */ }
  }
  if (!token) {
    token = (await getTokenFromCookie().catch(() => null)) ?? null;
  }
  if (!token) {
    return NextResponse.json({ ok: false, message: "Not authenticated." }, { status: 401 });
  }

  const { id } = await params;
  if (!id) {
    return NextResponse.json({ ok: false, message: "Missing paycheck id." }, { status: 400 });
  }
  if (!/^[a-zA-Z0-9_-]{1,21}$/.test(id)) {
    return NextResponse.json({ ok: false, message: "Invalid paycheck id." }, { status: 400 });
  }

  let body: PaycheckUpdateBody;
  try {
    body = (await request.json()) as PaycheckUpdateBody;
  } catch {
    return NextResponse.json({ ok: false, message: "Invalid JSON body." }, { status: 400 });
  }

  // Fetch the existing record first to discover actual PocketBase field names
  // (PocketBase may use camelCase or snake_case depending on how the collection was created)
  const existingRes = await fetch(`${resolvedBase}/api/collections/paychecks/records/${id}`, {
    headers: { Authorization: `Bearer ${token}` },
    cache: "no-store",
  });
  if (!existingRes.ok) {
    const text = await existingRes.text();
    return NextResponse.json({ ok: false, message: `Could not fetch record: ${existingRes.status} ${text}` }, { status: 502 });
  }
  const existing = (await existingRes.json()) as Record<string, unknown>;

  // Helper: pick the first field key that actually exists in the record
  function fieldKey(...candidates: string[]): string {
    for (const c of candidates) {
      if (c in existing) return c;
    }
    return candidates[0];
  }

  const allowedFrequencies = ["biweekly", "monthly", "monthlyLastWorkingDay"] as const;
  const payload: Record<string, unknown> = {};

  if (body.name !== undefined) {
    payload.name = typeof body.name === "string" ? body.name.trim() : body.name;
  }
  if (body.frequency !== undefined && allowedFrequencies.includes(body.frequency as (typeof allowedFrequencies)[number])) {
    payload.frequency = body.frequency;
  }
  if (body.anchorDate !== undefined) {
    const key = fieldKey("anchordate", "anchorDate", "anchor_date");
    const v = body.anchorDate;
    if (v === null || v === "") payload[key] = null;
    else if (typeof v === "string" && /^\d{4}-\d{2}-\d{2}(T[\d:.]+Z?)?$/.test(v.trim())) payload[key] = v.trim();
  }
  if (body.dayOfMonth !== undefined) {
    const key = fieldKey("dayOfMonth", "day_of_month");
    const n = body.dayOfMonth === null ? null : Number(body.dayOfMonth);
    if (n === null || (Number.isInteger(n) && n >= 1 && n <= 31)) payload[key] = n;
  }
  if (body.amount !== undefined) {
    const n = body.amount === null ? null : Number(body.amount);
    if (n === null || (typeof n === "number" && !Number.isNaN(n))) payload.amount = n;
  }
  if (body.paidThisMonthYearMonth !== undefined) {
    const key = fieldKey("paidThisMonthYearMonth", "paid_this_month_year_month");
    const v = body.paidThisMonthYearMonth;
    if (v === null || v === "") payload[key] = null;
    else if (typeof v === "string" && /^\d{4}-\d{2}$/.test(v.trim())) payload[key] = v.trim();
  }
  if (body.amountPaidThisMonth !== undefined) {
    const key = fieldKey("amountPaidThisMonth", "amount_paid_this_month");
    const n = body.amountPaidThisMonth === null ? null : Number(body.amountPaidThisMonth);
    if (n === null || (typeof n === "number" && !Number.isNaN(n))) payload[key] = n;
  }

  // Audit fields
  const userId = getUserIdFromToken(token);
  payload[fieldKey("lastEditedAt", "last_edited_at")] = new Date().toISOString();
  if (userId) {
    payload[fieldKey("lastEditedByUserId", "last_edited_by_user_id")] = userId;
    try {
      const userRes = await fetch(`${resolvedBase}/api/collections/users/records/${userId}`, {
        headers: { Authorization: `Bearer ${token}` },
        cache: "no-store",
      });
      if (userRes.ok) {
        const user = (await userRes.json()) as { name?: string; email?: string };
        const displayName = (user.name ?? user.email ?? userId).trim() || userId;
        payload[fieldKey("lastEditedBy", "last_edited_by")] = displayName;
      }
    } catch { /* ignore — audit fields are optional */ }
  }

  if (Object.keys(payload).length === 0) {
    return NextResponse.json(
      { ok: false, message: "No allowed fields to update." },
      { status: 400 }
    );
  }

  const url = `${resolvedBase}/api/collections/paychecks/records/${id}`;
  const res = await fetch(url, {
    method: "PATCH",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(payload),
  });

  if (!res.ok) {
    const text = await res.text();
    return NextResponse.json(
      { ok: false, message: res.status === 403 ? "Not allowed to update this paycheck." : text },
      { status: res.status }
    );
  }

  const data = (await res.json()) as Record<string, unknown>;
  return NextResponse.json({ ok: true, paycheck: data });
}
