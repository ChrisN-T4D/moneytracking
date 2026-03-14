import { NextResponse } from "next/server";
import { getPbBase } from "@/lib/pocketbase-auth";
import { getAdminToken } from "@/lib/pocketbase-setup";

export const dynamic = "force-dynamic";

/** DELETE /api/bills/delete-by-name?name=...&account=...&listType=... — deletes all bills matching name in that section. */
export async function DELETE(request: Request) {
  const base = getPbBase();
  if (!base) {
    return NextResponse.json({ ok: false, message: "PocketBase URL not configured." }, { status: 500 });
  }

  const url = new URL(request.url);
  const name = url.searchParams.get("name")?.trim();
  const account = url.searchParams.get("account")?.trim();
  const listType = url.searchParams.get("listType")?.trim();
  if (!name) return NextResponse.json({ ok: false, message: "name query param required." }, { status: 400 });
  if (!account) return NextResponse.json({ ok: false, message: "account query param required." }, { status: 400 });
  if (!listType) return NextResponse.json({ ok: false, message: "listType query param required." }, { status: 400 });

  const apiBase = (process.env.POCKETBASE_API_URL ?? process.env.NEXT_PUBLIC_POCKETBASE_URL ?? "").trim() || base;
  let token: string;
  let resolvedBase: string;
  try {
    const r = await getAdminToken(apiBase, process.env.POCKETBASE_ADMIN_EMAIL ?? "", process.env.POCKETBASE_ADMIN_PASSWORD ?? "");
    token = r.token;
    resolvedBase = r.baseUrl.replace(/\/$/, "");
  } catch {
    return NextResponse.json({ ok: false, message: "Admin auth required." }, { status: 401 });
  }

  const filter = encodeURIComponent(`name="${name.replace(/"/g, '\\"')}" && account="${account.replace(/"/g, '\\"')}" && listType="${listType.replace(/"/g, '\\"')}"`);
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
    return NextResponse.json({ ok: false, message: `No bills found matching name in this section.` }, { status: 404 });
  }

  for (const id of ids) {
    await fetch(`${resolvedBase}/api/collections/bills/records/${id}`, {
      method: "DELETE",
      headers: { Authorization: `Bearer ${token}` },
      cache: "no-store",
    });
  }

  const { revalidatePath } = await import("next/cache");
  revalidatePath("/");
  return NextResponse.json({ ok: true, deleted: ids.length });
}
