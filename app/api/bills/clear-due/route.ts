import { NextResponse } from "next/server";
import { getPbBase, getPbWriteToken } from "@/lib/pocketbase-auth";
import { escapePbFilterString } from "@/lib/mortgageBillNames";

export const dynamic = "force-dynamic";

/** PATCH /api/bills/clear-due?name=... — sets or clears nextDue on all bills matching the given name. Body: { nextDue?: string } (omit or "" to clear). */
export async function PATCH(request: Request) {
  const base = getPbBase();
  if (!base) return NextResponse.json({ ok: false, message: "PocketBase URL not configured." }, { status: 500 });

  const url = new URL(request.url);
  const name = url.searchParams.get("name")?.trim();
  if (!name) return NextResponse.json({ ok: false, message: "name query param required." }, { status: 400 });

  let nextDueValue = "";
  try {
    const body = (await request.json().catch(() => ({}))) as { nextDue?: string };
    if (body.nextDue !== undefined && body.nextDue !== null) {
      nextDueValue = String(body.nextDue).trim();
    }
  } catch {
    // no body or invalid — keep clear behavior
  }

  const auth = await getPbWriteToken(base);
  if (!auth) {
    return NextResponse.json(
      { ok: false, message: "Sign in or set PocketBase admin credentials to update due dates." },
      { status: 401 }
    );
  }

  const filter = encodeURIComponent(`name="${escapePbFilterString(name)}"`);
  const listRes = await fetch(
    `${auth.apiBase}/api/collections/bills/records?filter=${filter}&perPage=100`,
    { cache: "no-store", headers: { Authorization: `Bearer ${auth.token}` } }
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
    const res = await fetch(`${auth.apiBase}/api/collections/bills/records/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${auth.token}` },
      body: JSON.stringify({ nextDue: nextDueValue }),
    });
    if (res.ok) updated++;
  }

  const { revalidatePath } = await import("next/cache");
  revalidatePath("/");
  return NextResponse.json({ ok: true, updated });
}
