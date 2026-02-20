import { NextResponse } from "next/server";
import { getTokenFromCookie, getPbBase } from "@/lib/pocketbase-auth";
import { getAdminToken } from "@/lib/pocketbase-setup";

export const dynamic = "force-dynamic";

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
