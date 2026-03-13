import { NextResponse } from "next/server";
import { getTokenFromCookie, getPbBase } from "@/lib/pocketbase-auth";
import { getAdminToken } from "@/lib/pocketbase-setup";

export const dynamic = "force-dynamic";

type PatchBody = { transferredThisCycle?: boolean };

/** PATCH /api/auto-transfers/[id] — update one auto_transfers record (e.g. transferredThisCycle). */
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

  let body: PatchBody;
  try {
    body = (await request.json()) as PatchBody;
  } catch {
    return NextResponse.json({ ok: false, message: "Invalid JSON body." }, { status: 400 });
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

  const resolvedBase = apiBase.replace(/\/$/, "");
  const existingRes = await fetch(`${resolvedBase}/api/collections/auto_transfers/records/${id}`, {
    headers: { Authorization: `Bearer ${authToken}` },
    cache: "no-store",
  });
  if (!existingRes.ok) {
    const text = await existingRes.text();
    return NextResponse.json({ ok: false, message: `Could not fetch record: ${existingRes.status} ${text}` }, { status: 502 });
  }
  const existing = (await existingRes.json()) as Record<string, unknown>;

  function fieldKey(...candidates: string[]): string {
    for (const c of candidates) {
      if (c in existing) return c;
    }
    return candidates[0];
  }

  const payload: Record<string, unknown> = {};
  if (body.transferredThisCycle !== undefined) {
    const key = fieldKey("transferred_this_cycle", "transferredThisCycle");
    payload[key] = Boolean(body.transferredThisCycle);
  }
  if (Object.keys(payload).length === 0) {
    return NextResponse.json({ ok: true });
  }

  const res = await fetch(`${resolvedBase}/api/collections/auto_transfers/records/${id}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${authToken}` },
    body: JSON.stringify(payload),
    cache: "no-store",
  });
  if (!res.ok) {
    const text = await res.text();
    return NextResponse.json({ ok: false, message: `Update failed: ${res.status} ${text}` }, { status: res.status >= 500 ? 502 : res.status });
  }
  const { revalidatePath } = await import("next/cache");
  revalidatePath("/");
  return NextResponse.json({ ok: true });
}

/** DELETE /api/auto-transfers/[id] — delete one auto_transfers record in PocketBase. */
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

  const url = `${apiBase.replace(/\/$/, "")}/api/collections/auto_transfers/records/${id}`;
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
