import { NextResponse } from "next/server";
import { getTokenFromCookie, getPbBase } from "@/lib/pocketbase-auth";
import { getAdminToken } from "@/lib/pocketbase-setup";

export const dynamic = "force-dynamic";

type SpanishForkBillCreateBody = {
  name: string;
  frequency?: string;
  nextDue?: string;
  amount?: number;
};

const allowedFrequencies = ["2weeks", "monthly", "yearly"] as const;

/** POST /api/spanish-fork-bills — create a Spanish Fork bill in PocketBase. */
export async function POST(request: Request) {
  const base = getPbBase();
  if (!base) {
    return NextResponse.json(
      { ok: false, message: "PocketBase URL not configured." },
      { status: 500 }
    );
  }

  let body: SpanishForkBillCreateBody;
  try {
    body = (await request.json()) as SpanishForkBillCreateBody;
  } catch {
    return NextResponse.json({ ok: false, message: "Invalid JSON body." }, { status: 400 });
  }

  if (!body.name || typeof body.name !== "string" || !body.name.trim()) {
    return NextResponse.json({ ok: false, message: "name is required." }, { status: 400 });
  }

  const freq = body.frequency ?? "monthly";
  if (!allowedFrequencies.includes(freq as (typeof allowedFrequencies)[number])) {
    return NextResponse.json({ ok: false, message: `Invalid frequency: ${freq}` }, { status: 400 });
  }

  let authToken: string | null = (await getTokenFromCookie().catch(() => null)) ?? null;
  let apiBase = base;
  if (!authToken) {
    const email = process.env.POCKETBASE_ADMIN_EMAIL ?? "";
    const password = process.env.POCKETBASE_ADMIN_PASSWORD ?? "";
    if (email && password) {
      try {
        const result = await getAdminToken(base, email, password);
        authToken = result.token;
        apiBase = result.baseUrl;
      } catch {
        // continue
      }
    }
  }
  if (!authToken) {
    return NextResponse.json(
      { ok: false, message: "Not authenticated. Sign in or set PocketBase admin credentials." },
      { status: 401 }
    );
  }

  const payload = {
    name: body.name.trim(),
    frequency: freq,
    nextDue: (body.nextDue ?? "").trim(),
    amount: Number(body.amount) || 0,
    inThisPaycheck: false,
    tenantPaid: false,
  };

  const url = `${apiBase.replace(/\/$/, "")}/api/collections/spanish_fork_bills/records`;
  const res = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${authToken}`,
    },
    body: JSON.stringify(payload),
  });

  if (!res.ok) {
    const text = await res.text();
    return NextResponse.json(
      { ok: false, message: `Failed to create bill: ${res.status} ${text}` },
      { status: res.status }
    );
  }

  const data = (await res.json()) as Record<string, unknown>;
  const { revalidatePath } = await import("next/cache");
  revalidatePath("/");
  return NextResponse.json({ ok: true, record: data });
}
