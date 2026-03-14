import { NextResponse } from "next/server";
import { getPbBase } from "@/lib/pocketbase-auth";
import { getAdminToken } from "@/lib/pocketbase-setup";

export const dynamic = "force-dynamic";

type BillCreateBody = {
  name: string;
  frequency?: string;
  nextDue?: string;
  amount?: number;
  account?: string;
  listType?: string;
  autoTransferNote?: string | null;
  subsection?: string | null;
};

const allowedFrequencies = ["2weeks", "monthly", "yearly"] as const;

/** POST /api/bills — create a new bill/subscription record in PocketBase. */
export async function POST(request: Request) {
  const base = getPbBase();
  if (!base) {
    return NextResponse.json(
      { ok: false, message: "PocketBase URL not configured." },
      { status: 500 }
    );
  }

  let body: BillCreateBody;
  try {
    body = (await request.json()) as BillCreateBody;
  } catch {
    return NextResponse.json({ ok: false, message: "Invalid JSON body." }, { status: 400 });
  }

  if (!body.name || typeof body.name !== "string" || !body.name.trim()) {
    return NextResponse.json({ ok: false, message: "name is required." }, { status: 400 });
  }

  const freq = body.frequency ?? "monthly";
  if (!allowedFrequencies.includes(freq as typeof allowedFrequencies[number])) {
    return NextResponse.json({ ok: false, message: `Invalid frequency: ${freq}` }, { status: 400 });
  }

  const email = process.env.POCKETBASE_ADMIN_EMAIL ?? "";
  const password = process.env.POCKETBASE_ADMIN_PASSWORD ?? "";
  let authToken: string | null = null;
  let apiBase = base;

  if (email && password) {
    try {
      const result = await getAdminToken(base, email, password);
      authToken = result.token;
      apiBase = result.baseUrl;
    } catch {
      // fall through
    }
  }

  const payload: Record<string, unknown> = {
    name: body.name.trim(),
    frequency: freq,
    nextDue: body.nextDue ?? "",
    amount: body.amount ?? 0,
    account: body.account ?? "checking_account",
    listType: body.listType ?? "bills",
  };
  if (body.autoTransferNote !== undefined) payload.autoTransferNote = body.autoTransferNote;
  if (body.subsection !== undefined) payload.subsection = body.subsection;

  const url = `${apiBase.replace(/\/$/, "")}/api/collections/bills/records`;
  const res = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...(authToken ? { Authorization: `Bearer ${authToken}` } : {}),
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
