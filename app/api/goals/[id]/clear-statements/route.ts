import { NextResponse } from "next/server";
import { getPbBase } from "@/lib/pocketbase-auth";
import { getAdminToken } from "@/lib/pocketbase-setup";

export const dynamic = "force-dynamic";

const baseUrlForAuth = () =>
  (process.env.POCKETBASE_API_URL ?? process.env.NEXT_PUBLIC_POCKETBASE_URL ?? "").trim();

/**
 * POST /api/goals/[id]/clear-statements
 * Clears the goal assignment from all statements that currently have this goalId.
 * Uses admin auth. After clearing, recalculates the goal's currentAmount to 0.
 */
export async function POST(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const goalId = (await params).id;
  if (!goalId?.trim()) {
    return NextResponse.json({ ok: false, message: "Missing goal id." }, { status: 400 });
  }

  const url = baseUrlForAuth();
  const email = process.env.POCKETBASE_ADMIN_EMAIL ?? "";
  const password = process.env.POCKETBASE_ADMIN_PASSWORD ?? "";

  if (!url || !email || !password) {
    return NextResponse.json(
      { ok: false, message: "PocketBase admin credentials not configured." },
      { status: 500 }
    );
  }

  let token: string;
  let resolvedBase: string;
  try {
    const r = await getAdminToken(url, email, password);
    token = r.token;
    resolvedBase = r.baseUrl.replace(/\/$/, "");
  } catch {
    return NextResponse.json({ ok: false, message: "Admin auth failed." }, { status: 401 });
  }

  const headers = {
    "Content-Type": "application/json",
    Authorization: `Bearer ${token}`,
  };

  // Discover actual goal field name on statements (goalid vs goalId)
  let goalField = "goalId";
  try {
    const colRes = await fetch(`${resolvedBase}/api/collections/statements`, {
      headers: { Authorization: `Bearer ${token}` },
      cache: "no-store",
    });
    if (colRes.ok) {
      const colData = (await colRes.json()) as Record<string, unknown>;
      const fieldsArr = ((colData.fields ?? colData.schema ?? []) as { name?: string }[]).map(
        (f) => f.name ?? ""
      );
      if (fieldsArr.includes("goalid")) goalField = "goalid";
      else if (fieldsArr.includes("goalId")) goalField = "goalId";
    }
  } catch {
    // keep default
  }

  const cleared: string[] = [];
  let page = 1;
  const perPage = 100;

  while (true) {
    const filter = encodeURIComponent(`${goalField}="${goalId}"`);
    const listRes = await fetch(
      `${resolvedBase}/api/collections/statements/records?filter=${filter}&perPage=${perPage}&page=${page}&fields=id`,
      { headers: { Authorization: `Bearer ${token}` }, cache: "no-store" }
    );
    if (!listRes.ok) {
      return NextResponse.json(
        { ok: false, message: `Failed to list statements: ${listRes.status}` },
        { status: 502 }
      );
    }
    const data = (await listRes.json()) as { items?: { id: string }[]; totalItems?: number };
    const items = data.items ?? [];
    if (items.length === 0) break;

    for (const st of items) {
      const patchRes = await fetch(
        `${resolvedBase}/api/collections/statements/records/${st.id}`,
        {
          method: "PATCH",
          headers,
          body: JSON.stringify({ [goalField]: "" }),
        }
      );
      if (patchRes.ok) cleared.push(st.id);
    }

    const totalItems = data.totalItems ?? 0;
    if (page * perPage >= totalItems) break;
    page++;
  }

  // Set goal's currentAmount to 0 (or sum of remaining if any — but we cleared all, so 0)
  await fetch(`${resolvedBase}/api/collections/goals/records/${goalId}`, {
    method: "PATCH",
    headers,
    body: JSON.stringify({ currentAmount: 0 }),
  });

  return NextResponse.json({
    ok: true,
    cleared: cleared.length,
    message: `Cleared ${cleared.length} transaction${cleared.length !== 1 ? "s" : ""} from this goal.`,
  });
}
