import { NextResponse } from "next/server";
import { getTokenFromCookie, getPbBase } from "@/lib/pocketbase-auth";
import { getAdminToken } from "@/lib/pocketbase-setup";

export const dynamic = "force-dynamic";

async function getAuthTokenAndBase(): Promise<{ token: string | null; apiBase: string }> {
  const base = getPbBase();
  if (!base) return { token: null, apiBase: "" };
  let authToken: string | null = (await getTokenFromCookie().catch(() => null)) ?? null;
  let apiBase = base;
  if (!authToken) {
    const email = process.env.POCKETBASE_ADMIN_EMAIL ?? "";
    const password = process.env.POCKETBASE_ADMIN_PASSWORD ?? "";
    if (email && password) {
      try {
        const r = await getAdminToken(base, email, password);
        authToken = r.token;
        apiBase = r.baseUrl;
      } catch {
        /* leave null */
      }
    }
  }
  return { token: authToken, apiBase };
}

/** PATCH /api/goals/[id] — update a goal (monthlyContribution, currentAmount, currentAmountDelta, etc.) */
export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const base = getPbBase();
  if (!base) {
    return NextResponse.json({ ok: false, message: "PocketBase URL not configured." }, { status: 500 });
  }
  const { id } = await params;
  if (!id) {
    return NextResponse.json({ ok: false, message: "Missing id." }, { status: 400 });
  }

  let body: {
    monthlyContribution?: number | null;
    currentAmount?: number;
    targetAmount?: number;
    name?: string;
    targetDate?: string | null;
    category?: string | null;
    /** Atomically add to existing PocketBase currentAmount (read–modify–write). */
    currentAmountDelta?: number | null;
  };
  try {
    body = (await request.json()) as typeof body;
  } catch {
    return NextResponse.json({ ok: false, message: "Invalid JSON body." }, { status: 400 });
  }

  const { token, apiBase } = await getAuthTokenAndBase();
  if (!token) {
    return NextResponse.json({ ok: false, message: "Not authenticated." }, { status: 401 });
  }

  const recordUrl = `${apiBase.replace(/\/$/, "")}/api/collections/goals/records/${id}`;
  const headers = { "Content-Type": "application/json", Authorization: `Bearer ${token}` };

  const payload: Record<string, unknown> = {};
  if (body.monthlyContribution !== undefined) payload.monthlyContribution = body.monthlyContribution ?? null;
  if (body.targetAmount !== undefined) payload.targetAmount = Number(body.targetAmount);
  if (body.name !== undefined) payload.name = String(body.name).trim();
  if (body.targetDate !== undefined) payload.targetDate = body.targetDate ?? null;
  if (body.category !== undefined) payload.category = body.category ?? null;

  if (body.currentAmountDelta !== undefined && body.currentAmountDelta !== null) {
    const delta = Number(body.currentAmountDelta);
    if (Number.isNaN(delta)) {
      return NextResponse.json({ ok: false, message: "currentAmountDelta must be a number." }, { status: 400 });
    }
    const getRes = await fetch(recordUrl, { headers: { Authorization: `Bearer ${token}` }, cache: "no-store" });
    if (!getRes.ok) {
      const text = await getRes.text();
      return NextResponse.json(
        { ok: false, message: `Could not load goal: ${getRes.status} ${text}` },
        { status: getRes.status >= 500 ? 502 : getRes.status }
      );
    }
    const rec = (await getRes.json()) as Record<string, unknown>;
    const cur = Number(rec.currentAmount ?? 0) || 0;
    const baseCa = Number.isFinite(cur) ? cur : 0;
    payload.currentAmount = Math.max(0, baseCa + delta);
  } else if (body.currentAmount !== undefined) {
    payload.currentAmount = Number(body.currentAmount);
  }

  if (Object.keys(payload).length === 0) {
    return NextResponse.json({ ok: false, message: "No fields to update." }, { status: 400 });
  }

  const res = await fetch(recordUrl, {
    method: "PATCH",
    headers,
    body: JSON.stringify(payload),
    cache: "no-store",
  });
  if (!res.ok) {
    const text = await res.text();
    return NextResponse.json({ ok: false, message: `Update failed: ${res.status} ${text}` }, { status: 502 });
  }

  const updated = (await res.json()) as Record<string, unknown>;
  const { revalidatePath } = await import("next/cache");
  revalidatePath("/");
  return NextResponse.json({ ok: true, goal: updated });
}
