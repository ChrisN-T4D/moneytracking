import { NextResponse } from "next/server";
import { getTokenFromCookie, getPbBase } from "@/lib/pocketbase-auth";

export const dynamic = "force-dynamic";

/** PATCH /api/goals/[id] — update a goal (monthlyContribution, currentAmount, etc.) */
export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const base = getPbBase();
  if (!base) {
    return NextResponse.json({ ok: false, message: "PocketBase URL not configured." }, { status: 500 });
  }
  const token = await getTokenFromCookie().catch(() => null);
  if (!token) {
    return NextResponse.json({ ok: false, message: "Not authenticated." }, { status: 401 });
  }
  const { id } = await params;
  if (!id) {
    return NextResponse.json({ ok: false, message: "Missing id." }, { status: 400 });
  }

  let body: { monthlyContribution?: number | null; currentAmount?: number; targetAmount?: number; name?: string; targetDate?: string | null; category?: string | null };
  try {
    body = (await request.json()) as typeof body;
  } catch {
    return NextResponse.json({ ok: false, message: "Invalid JSON body." }, { status: 400 });
  }

  const payload: Record<string, unknown> = {};
  if (body.monthlyContribution !== undefined) payload.monthlyContribution = body.monthlyContribution ?? null;
  if (body.currentAmount !== undefined) payload.currentAmount = Number(body.currentAmount);
  if (body.targetAmount !== undefined) payload.targetAmount = Number(body.targetAmount);
  if (body.name !== undefined) payload.name = String(body.name).trim();
  if (body.targetDate !== undefined) payload.targetDate = body.targetDate ?? null;
  if (body.category !== undefined) payload.category = body.category ?? null;

  if (Object.keys(payload).length === 0) {
    return NextResponse.json({ ok: false, message: "No fields to update." }, { status: 400 });
  }

  const res = await fetch(`${base.replace(/\/$/, "")}/api/collections/goals/records/${id}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
    body: JSON.stringify(payload),
    cache: "no-store",
  });
  if (!res.ok) {
    const text = await res.text();
    return NextResponse.json({ ok: false, message: `Update failed: ${res.status} ${text}` }, { status: 502 });
  }

  const updated = (await res.json()) as Record<string, unknown>;
  return NextResponse.json({ ok: true, goal: updated });
}
