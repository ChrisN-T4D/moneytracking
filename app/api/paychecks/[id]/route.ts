import { NextResponse } from "next/server";
import { getTokenFromCookie, getPbBase, getUserIdFromToken } from "@/lib/pocketbase-auth";

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
  const token = await getTokenFromCookie();
  if (!token) {
    return NextResponse.json({ ok: false, message: "Not authenticated." }, { status: 401 });
  }

  const base = getPbBase();
  if (!base) {
    return NextResponse.json(
      { ok: false, message: "PocketBase URL not configured." },
      { status: 500 }
    );
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
    if (v === null || v === "") payload.anchorDate = null;
    else if (typeof v === "string" && /^\d{4}-\d{2}-\d{2}(T[\d:.]+Z?)?$/.test(v.trim())) payload.anchorDate = v.trim();
  }
  if (body.dayOfMonth !== undefined) {
    const n = body.dayOfMonth === null ? null : Number(body.dayOfMonth);
    if (n === null || (Number.isInteger(n) && n >= 1 && n <= 31)) payload.dayOfMonth = n;
  }
  if (body.amount !== undefined) {
    const n = body.amount === null ? null : Number(body.amount);
    if (n === null || (typeof n === "number" && !Number.isNaN(n))) payload.amount = n;
  }
  if (body.paidThisMonthYearMonth !== undefined) {
    const v = body.paidThisMonthYearMonth;
    if (v === null || v === "") payload.paidThisMonthYearMonth = null;
    else if (typeof v === "string" && /^\d{4}-\d{2}$/.test(v.trim())) payload.paidThisMonthYearMonth = v.trim();
  }
  if (body.amountPaidThisMonth !== undefined) {
    const n = body.amountPaidThisMonth === null ? null : Number(body.amountPaidThisMonth);
    if (n === null || (typeof n === "number" && !Number.isNaN(n))) payload.amountPaidThisMonth = n;
  }

  const userId = getUserIdFromToken(token);
  let lastEditedBy: string | null = null;
  if (userId) {
    payload.lastEditedByUserId = userId;
    payload.lastEditedAt = new Date().toISOString();
    try {
      const userRes = await fetch(`${base.replace(/\/$/, "")}/api/collections/users/records/${userId}`, {
        headers: { Authorization: `Bearer ${token}` },
        cache: "no-store",
      });
      if (userRes.ok) {
        const user = (await userRes.json()) as { name?: string; email?: string };
        lastEditedBy = (user.name ?? user.email ?? userId).trim() || userId;
      } else {
        lastEditedBy = userId;
      }
    } catch {
      lastEditedBy = userId;
    }
    if (lastEditedBy) payload.lastEditedBy = lastEditedBy;
  }

  if (Object.keys(payload).length === 0) {
    return NextResponse.json(
      { ok: false, message: "No allowed fields to update." },
      { status: 400 }
    );
  }

  const url = `${base.replace(/\/$/, "")}/api/collections/paychecks/records/${id}`;
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
