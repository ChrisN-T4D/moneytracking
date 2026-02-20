import { NextResponse } from "next/server";
import { getAdminToken } from "@/lib/pocketbase-setup";

export const dynamic = "force-dynamic";

const PER_PAGE = 500;
const DELETE_BATCH = 50;

/**
 * DELETE /api/statements/delete-all
 * Deletes all records in the statements collection. Requires admin env vars.
 */
export async function DELETE() {
  const baseUrl = (
    process.env.POCKETBASE_API_URL ??
    process.env.NEXT_PUBLIC_POCKETBASE_URL ??
    ""
  ).trim();
  const email = process.env.POCKETBASE_ADMIN_EMAIL ?? "";
  const password = process.env.POCKETBASE_ADMIN_PASSWORD ?? "";

  if (!baseUrl || !email || !password) {
    return NextResponse.json(
      {
        ok: false,
        message:
          "POCKETBASE_API_URL (or NEXT_PUBLIC_POCKETBASE_URL) and POCKETBASE_ADMIN_EMAIL / POCKETBASE_ADMIN_PASSWORD must be set.",
      },
      { status: 400 }
    );
  }

  try {
    const { token, baseUrl: apiBase } = await getAdminToken(baseUrl, email, password);
    const base = apiBase.replace(/\/$/, "");

    const allIds: string[] = [];
    let page = 1;
    let hasMore = true;

    while (hasMore) {
      const res = await fetch(
        `${base}/api/collections/statements/records?perPage=${PER_PAGE}&page=${page}&sort=-date`,
        { headers: { Authorization: `Bearer ${token}` }, cache: "no-store" }
      );
      if (!res.ok) {
        const text = await res.text();
        return NextResponse.json(
          { ok: false, message: `Failed to list statements: ${res.status} ${text}` },
          { status: 502 }
        );
      }
      const data = (await res.json()) as {
        items?: Array<{ id: string }>;
        totalPages?: number;
      };
      const items = data.items ?? [];
      for (const item of items) allIds.push(item.id);
      const totalPages = data.totalPages ?? 1;
      hasMore = page < totalPages;
      page += 1;
    }

    let deleted = 0;
    for (let i = 0; i < allIds.length; i += DELETE_BATCH) {
      const batch = allIds.slice(i, i + DELETE_BATCH);
      await Promise.all(
        batch.map((id) =>
          fetch(`${base}/api/collections/statements/records/${id}`, {
            method: "DELETE",
            headers: { Authorization: `Bearer ${token}` },
            cache: "no-store",
          })
        )
      );
      deleted += batch.length;
    }

    return NextResponse.json({ ok: true, deleted, message: `Deleted ${deleted} statement(s).` });
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    return NextResponse.json({ ok: false, message: `Delete all failed: ${message}` }, { status: 500 });
  }
}
