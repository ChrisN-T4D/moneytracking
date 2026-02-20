import { NextResponse } from "next/server";
import { getTokenFromCookie, getPbBase } from "@/lib/pocketbase-auth";
import { getAdminToken } from "@/lib/pocketbase-setup";

export const dynamic = "force-dynamic";

type CreateBody = {
  whatFor?: string;
  frequency?: string;
  account?: string;
  date?: string;
  amount?: number;
};

/** POST /api/auto-transfers — create an auto transfer record in PocketBase. */
export async function POST(request: Request) {
  const base = getPbBase();
  if (!base) {
    return NextResponse.json(
      { ok: false, message: "PocketBase URL not configured." },
      { status: 500 }
    );
  }

  let body: CreateBody;
  try {
    body = (await request.json()) as CreateBody;
  } catch {
    return NextResponse.json({ ok: false, message: "Invalid JSON body." }, { status: 400 });
  }

  const whatFor = (body.whatFor ?? "").trim();
  const frequency = (body.frequency ?? "").trim() || "monthly";
  const account = (body.account ?? "").trim() || "Bills";
  const date = (body.date ?? "").trim();
  const amount = Number(body.amount);
  const amountNum = Number.isFinite(amount) && amount >= 0 ? amount : 0;

  if (!whatFor) {
    return NextResponse.json(
      { ok: false, message: "whatFor is required." },
      { status: 400 }
    );
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
        // fall through
      }
    }
  }

  if (!authToken) {
    return NextResponse.json(
      { ok: false, message: "Not authenticated. Sign in or set PocketBase admin credentials." },
      { status: 401 }
    );
  }

  const url = `${apiBase.replace(/\/$/, "")}/api/collections/auto_transfers/records`;
  const res = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${authToken}`,
    },
    body: JSON.stringify({ whatFor, frequency, account, date, amount: amountNum }),
    cache: "no-store",
  });

  if (!res.ok) {
    const text = await res.text();
    return NextResponse.json(
      { ok: false, message: `Create failed: ${res.status} ${text}` },
      { status: res.status >= 500 ? 502 : res.status }
    );
  }

  const created = (await res.json()) as {
    id: string;
    whatFor?: string;
    frequency?: string;
    account?: string;
    date?: string;
    amount?: number;
  };

  return NextResponse.json({
    ok: true,
    record: {
      id: created.id,
      whatFor: created.whatFor ?? whatFor,
      frequency: created.frequency ?? frequency,
      account: created.account ?? account,
      date: created.date ?? date,
      amount: Number(created.amount ?? amountNum),
    },
  });
}
