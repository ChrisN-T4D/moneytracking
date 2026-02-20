import { NextResponse } from "next/server";
import { getTokenFromCookie, getPbBase } from "@/lib/pocketbase-auth";
import { getAdminToken } from "@/lib/pocketbase-setup";

export const dynamic = "force-dynamic";

type SpanishForkBillUpdateBody = {
  tenantPaid?: boolean;
  amount?: number | null;
  name?: string;
  nextDue?: string;
  frequency?: string;
};

/** PATCH /api/spanish-fork-bills/[id] — update a Spanish Fork bill record. */
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

  const { id } = await params;
  if (!id || !/^[a-zA-Z0-9_-]{1,21}$/.test(id)) {
    return NextResponse.json({ ok: false, message: "Invalid id." }, { status: 400 });
  }

  let body: SpanishForkBillUpdateBody;
  try {
    body = (await request.json()) as SpanishForkBillUpdateBody;
  } catch {
    return NextResponse.json({ ok: false, message: "Invalid JSON body." }, { status: 400 });
  }

  const payload: Record<string, unknown> = {};

  if (body.tenantPaid !== undefined) {
    if (typeof body.tenantPaid !== "boolean") {
      return NextResponse.json({ ok: false, message: "tenantPaid must be a boolean." }, { status: 400 });
    }
    payload.tenantPaid = body.tenantPaid;
  }
  if (body.amount !== undefined) {
    const n = body.amount === null ? 0 : Number(body.amount);
    if (Number.isNaN(n) || n < 0) {
      return NextResponse.json({ ok: false, message: "amount must be a non-negative number." }, { status: 400 });
    }
    payload.amount = n;
  }
  if (body.name !== undefined) {
    const v = String(body.name ?? "").trim();
    if (!v) return NextResponse.json({ ok: false, message: "name cannot be empty." }, { status: 400 });
    payload.name = v;
  }
  if (body.nextDue !== undefined) payload.nextDue = String(body.nextDue ?? "").trim();
  if (body.frequency !== undefined) payload.frequency = String(body.frequency ?? "").trim();

  if (Object.keys(payload).length === 0) {
    return NextResponse.json({ ok: false, message: "No valid fields to update." }, { status: 400 });
  }

  // Try user auth token first, fall back to admin token
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
        // no token — attempt unauthenticated (collection may allow it)
      }
    }
  }

  const url = `${apiBase.replace(/\/$/, "")}/api/collections/spanish_fork_bills/records/${id}`;
  const res = await fetch(url, {
    method: "PATCH",
    headers: {
      "Content-Type": "application/json",
      ...(authToken ? { Authorization: `Bearer ${authToken}` } : {}),
    },
    body: JSON.stringify(payload),
  });

  if (!res.ok) {
    const text = await res.text();
    const message =
      res.status === 404
        ? "Spanish Fork bill not found in PocketBase. Make sure the bill exists and you're not using demo data."
        : `Failed to update: ${res.status} ${text}`;
    return NextResponse.json({ ok: false, message }, { status: res.status });
  }

  const data = (await res.json()) as Record<string, unknown>;
  return NextResponse.json({ ok: true, record: data });
}

/** DELETE /api/spanish-fork-bills/[id] — delete a Spanish Fork bill record in PocketBase. */
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
  if (!id || !/^[a-zA-Z0-9_-]{1,21}$/.test(id)) {
    return NextResponse.json({ ok: false, message: "Invalid id." }, { status: 400 });
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
      } catch {}
    }
  }
  if (!authToken) {
    return NextResponse.json(
      { ok: false, message: "Not authenticated. Sign in or set PocketBase admin credentials." },
      { status: 401 }
    );
  }

  const url = `${apiBase.replace(/\/$/, "")}/api/collections/spanish_fork_bills/records/${id}`;
  const res = await fetch(url, {
    method: "DELETE",
    headers: { Authorization: `Bearer ${authToken}` },
    cache: "no-store",
  });
  if (!res.ok) {
    const text = await res.text();
    return NextResponse.json(
      { ok: false, message: `Delete failed: ${res.status} ${text}` },
      { status: res.status >= 500 ? 502 : res.status }
    );
  }
  const { revalidatePath } = await import("next/cache");
  revalidatePath("/");
  return NextResponse.json({ ok: true });
}
