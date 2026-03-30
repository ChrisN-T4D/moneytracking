import { NextResponse } from "next/server";
import { getTokenFromCookie, getPbBase, getUserIdFromToken } from "@/lib/pocketbase-auth";
import { getAdminToken } from "@/lib/pocketbase-setup";
import { isPbRecordId, PB } from "@/lib/pbFieldMap";

export const dynamic = "force-dynamic";

type PaycheckUpdateBody = {
  name?: string;
  frequency?: string;
  anchorDate?: string | null;
  dayOfMonth?: number | null;
  amount?: number | null;
  paidThisMonthYearMonth?: string | null;
  amountPaidThisMonth?: number | null;
  fundingMonthPreference?: "same_month" | "next_month" | "split" | null | "";
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
  if (!isPbRecordId(id)) {
    return NextResponse.json({ ok: false, message: "Invalid paycheck id." }, { status: 400 });
  }

  let body: PaycheckUpdateBody;
  try {
    body = (await request.json()) as PaycheckUpdateBody;
  } catch {
    return NextResponse.json({ ok: false, message: "Invalid JSON body." }, { status: 400 });
  }

  const P = PB.paychecks;
  const allowedFrequencies = ["biweekly", "monthly", "monthlyLastWorkingDay"] as const;
  const payload: Record<string, unknown> = {};

  if (body.name !== undefined) {
    payload.name = typeof body.name === "string" ? body.name.trim() : body.name;
  }
  if (body.frequency !== undefined && allowedFrequencies.includes(body.frequency as (typeof allowedFrequencies)[number])) {
    payload.frequency = body.frequency;
  }
  if (body.anchorDate !== undefined) {
    const v = body.anchorDate;
    if (v === null || v === "") payload[P.anchorDate] = null;
    else if (typeof v === "string" && /^\d{4}-\d{2}-\d{2}(T[\d:.]+Z?)?$/.test(v.trim())) payload[P.anchorDate] = v.trim();
  }
  if (body.dayOfMonth !== undefined) {
    const n = body.dayOfMonth === null ? null : Number(body.dayOfMonth);
    if (n === null || (Number.isInteger(n) && n >= 1 && n <= 31)) payload[P.dayOfMonth] = n;
  }
  if (body.amount !== undefined) {
    const n = body.amount === null ? null : Number(body.amount);
    if (n === null || (typeof n === "number" && !Number.isNaN(n))) payload.amount = n;
  }
  if (body.paidThisMonthYearMonth !== undefined) {
    const v = body.paidThisMonthYearMonth;
    if (v === null || v === "") payload[P.paidThisMonthYearMonth] = null;
    else if (typeof v === "string" && /^\d{4}-\d{2}$/.test(v.trim())) payload[P.paidThisMonthYearMonth] = v.trim();
  }
  if (body.amountPaidThisMonth !== undefined) {
    const n = body.amountPaidThisMonth === null ? null : Number(body.amountPaidThisMonth);
    if (n === null || (typeof n === "number" && !Number.isNaN(n))) payload[P.amountPaidThisMonth] = n;
  }
  if (body.fundingMonthPreference !== undefined) {
    const v = body.fundingMonthPreference;
    if (v === null || v === "" || (typeof v === "string" && v.trim() === "")) payload.fundingMonthPreference = null;
    else if (v === "same_month" || v === "next_month" || v === "split") payload.fundingMonthPreference = v;
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

/** DELETE /api/paychecks/[id] — delete one paycheck record in PocketBase. */
export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const base = getPbBase();
  if (!base) {
    return NextResponse.json(
      { ok: false, message: "PocketBase URL not configured." },
      { status: 500 }
    );
  }

  const { id } = await params;
  if (!id || !isPbRecordId(id)) {
    return NextResponse.json({ ok: false, message: "Invalid paycheck id." }, { status: 400 });
  }
  if (id.startsWith("default-")) {
    return NextResponse.json({ ok: false, message: "Cannot delete default paycheck." }, { status: 400 });
  }

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

  const url = `${resolvedBase}/api/collections/paychecks/records/${id}`;
  const res = await fetch(url, {
    method: "DELETE",
    headers: { Authorization: `Bearer ${token}` },
    cache: "no-store",
  });

  if (!res.ok) {
    const text = await res.text();
    return NextResponse.json(
      { ok: false, message: res.status === 403 ? "Not allowed to delete this paycheck." : text },
      { status: res.status }
    );
  }

  const { revalidatePath } = await import("next/cache");
  revalidatePath("/");
  return NextResponse.json({ ok: true });
}
