import { NextResponse } from "next/server";
import { getPbBase } from "@/lib/pocketbase-auth";
import { getAdminToken } from "@/lib/pocketbase-setup";

export const dynamic = "force-dynamic";

const POCKETBASE_API_URL = (process.env.POCKETBASE_API_URL ?? process.env.NEXT_PUBLIC_POCKETBASE_URL ?? "").trim();

/** PATCH /api/bills/clear-due?name=... — clears nextDue on all bills matching the given name. */
export async function PATCH(request: Request) {
  const base = getPbBase();
  if (!base) return NextResponse.json({ ok: false, message: "PocketBase URL not configured." }, { status: 500 });

  const url = new URL(request.url);
  const name = url.searchParams.get("name")?.trim();
  if (!name) return NextResponse.json({ ok: false, message: "name query param required." }, { status: 400 });

  const email = process.env.POCKETBASE_ADMIN_EMAIL ?? "";
  const password = process.env.POCKETBASE_ADMIN_PASSWORD ?? "";
  const apiBase = POCKETBASE_API_URL || base;

  let token: string;
  let resolvedBase: string;
  try {
    const r = await getAdminToken(apiBase, email, password);
    token = r.token;
    resolvedBase = r.baseUrl.replace(/\/$/, "");
  } catch {
    return NextResponse.json({ ok: false, message: "Admin auth required to clear due dates." }, { status: 401 });
  }

  // Fetch all bills matching this name
  const filter = encodeURIComponent(`name="${name}"`);
  const listRes = await fetch(
    `${resolvedBase}/api/collections/bills/records?filter=${filter}&perPage=100`,
    { cache: "no-store", headers: { Authorization: `Bearer ${token}` } }
  );
  if (!listRes.ok) {
    return NextResponse.json({ ok: false, message: `Could not fetch bills: ${listRes.status}` }, { status: 502 });
  }
  const listData = (await listRes.json()) as { items?: { id: string }[] };
  const ids = (listData.items ?? []).map((b) => b.id);
  if (ids.length === 0) {
    return NextResponse.json({ ok: false, message: `No bills found with name "${name}".` }, { status: 404 });
  }

  let updated = 0;
  for (const id of ids) {
    const res = await fetch(`${resolvedBase}/api/collections/bills/records/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      body: JSON.stringify({ nextDue: "" }),
    });
    if (res.ok) updated++;
  }

  return NextResponse.json({ ok: true, updated });
}
