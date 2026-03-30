import { NextResponse } from "next/server";
import { getTokenFromCookie, getPbBase } from "@/lib/pocketbase-auth";
import { getAdminToken } from "@/lib/pocketbase-setup";
import { PB } from "@/lib/pbFieldMap";

export const dynamic = "force-dynamic";

async function resolveAuth() {
  const base = getPbBase();
  if (!base) return { token: null as string | null, apiBase: "" };
  let token: string | null = (await getTokenFromCookie().catch(() => null)) ?? null;
  let apiBase = base;
  if (!token) {
    const email = process.env.POCKETBASE_ADMIN_EMAIL ?? "";
    const password = process.env.POCKETBASE_ADMIN_PASSWORD ?? "";
    if (email && password) {
      try {
        const r = await getAdminToken(base, email, password);
        token = r.token;
        apiBase = r.baseUrl;
      } catch { /* */ }
    }
  }
  return { token, apiBase };
}

/** POST /api/paychecks — create a new paycheck. */
export async function POST(request: Request) {
  const { token, apiBase } = await resolveAuth();
  if (!token || !apiBase) {
    return NextResponse.json({ ok: false, message: "Not authenticated." }, { status: 401 });
  }

  let body: {
    name?: string;
    frequency?: string;
    anchorDate?: string | null;
    dayOfMonth?: number | null;
    amount?: number | null;
  };
  try {
    body = (await request.json()) as typeof body;
  } catch {
    return NextResponse.json({ ok: false, message: "Invalid JSON body." }, { status: 400 });
  }

  const name = (body.name ?? "").trim();
  if (!name) {
    return NextResponse.json({ ok: false, message: "name is required." }, { status: 400 });
  }

  const P = PB.paychecks;
  const payload: Record<string, unknown> = {
    name,
    frequency: body.frequency ?? "biweekly",
    [P.anchorDate]: body.anchorDate ?? null,
    [P.dayOfMonth]: body.dayOfMonth ?? null,
    amount: body.amount ?? 0,
  };

  const base = apiBase.replace(/\/$/, "");
  const res = await fetch(`${base}/api/collections/paychecks/records`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify(payload),
    cache: "no-store",
  });

  if (!res.ok) {
    const text = await res.text();
    return NextResponse.json({ ok: false, message: `Create failed: ${res.status} ${text}` }, { status: 502 });
  }

  const created = (await res.json()) as Record<string, unknown>;
  const { revalidatePath } = await import("next/cache");
  revalidatePath("/");
  return NextResponse.json({ ok: true, paycheck: created });
}

/** GET /api/paychecks — list all paychecks. */
export async function GET() {
  const { token, apiBase } = await resolveAuth();
  if (!token || !apiBase) {
    return NextResponse.json({ ok: false, message: "Not authenticated." }, { status: 401 });
  }

  const base = apiBase.replace(/\/$/, "");
  const res = await fetch(`${base}/api/collections/paychecks/records?perPage=100`, {
    headers: { Authorization: `Bearer ${token}` },
    cache: "no-store",
  });

  if (!res.ok) {
    return NextResponse.json({ ok: false, message: `Fetch failed: ${res.status}` }, { status: 502 });
  }

  const data = (await res.json()) as { items?: Array<Record<string, unknown>> };
  return NextResponse.json({ ok: true, items: data.items ?? [] });
}
