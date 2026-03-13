import { NextResponse } from "next/server";
import { getPbBase } from "@/lib/pocketbase-auth";
import { getAdminToken } from "@/lib/pocketbase-setup";
import { getPaychecks } from "@/lib/pocketbase";
import { getStatements } from "@/lib/pocketbase";

export const dynamic = "force-dynamic";

/** GET /api/paychecks/[id]/linkable-statements — recent deposits (positive statements) for linking to this paycheck. */
export async function GET(
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

  let token: string | null = null;
  const adminEmail = process.env.POCKETBASE_ADMIN_EMAIL ?? "";
  const adminPassword = process.env.POCKETBASE_ADMIN_PASSWORD ?? "";
  if (adminEmail && adminPassword) {
    try {
      const r = await getAdminToken(base, adminEmail, adminPassword);
      token = r.token;
    } catch { /* fall through */ }
  }
  if (!token) {
    const { getTokenFromCookie } = await import("@/lib/pocketbase-auth");
    token = (await getTokenFromCookie().catch(() => null)) ?? null;
  }
  if (!token) {
    return NextResponse.json({ ok: false, message: "Not authenticated." }, { status: 401 });
  }

  const { id } = await params;
  if (!id || !/^[a-zA-Z0-9_-]{1,21}$/.test(id)) {
    return NextResponse.json({ ok: false, message: "Invalid paycheck id." }, { status: 400 });
  }

  const configs = await getPaychecks();
  const paycheck = configs.find((c) => c.id === id);
  if (!paycheck) {
    return NextResponse.json({ ok: false, message: "Paycheck not found." }, { status: 404 });
  }

  const statements = await getStatements({ perPage: 500, sort: "-date" });
  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - 90);
  const deposits = statements
    .filter((s) => s.amount > 0 && new Date(s.date) >= cutoff)
    .slice(0, 100)
    .map((s) => ({
      id: s.id,
      date: s.date,
      description: s.description ?? "",
      amount: s.amount,
    }));
  return NextResponse.json({ ok: true, statements: deposits });
}
