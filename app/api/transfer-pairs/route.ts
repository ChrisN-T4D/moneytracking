import { NextResponse } from "next/server";
import { getAdminToken } from "@/lib/pocketbase-setup";

export const dynamic = "force-dynamic";

const baseUrlForAuth = () =>
  (process.env.POCKETBASE_API_URL ?? process.env.NEXT_PUBLIC_POCKETBASE_URL ?? "").trim();

interface PairPayload {
  outStatementId: string;
  inStatementId: string;
  fromAccount: string;
  toAccount: string;
  goalId?: string | null;
}

/**
 * POST /api/transfer-pairs — Save transfer pairings by patching statement records
 * with pairedStatementId and goalId.
 */
export async function POST(request: Request) {
  const url = baseUrlForAuth();
  const email = process.env.POCKETBASE_ADMIN_EMAIL ?? "";
  const password = process.env.POCKETBASE_ADMIN_PASSWORD ?? "";

  if (!url || !email || !password) {
    return NextResponse.json({ ok: false, message: "PocketBase admin credentials not configured." }, { status: 500 });
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

  let body: { pairs?: PairPayload[] };
  try {
    body = (await request.json()) as { pairs?: PairPayload[] };
  } catch {
    return NextResponse.json({ ok: false, message: "Invalid JSON body." }, { status: 400 });
  }

  const pairs = body.pairs ?? [];
  if (pairs.length === 0) {
    return NextResponse.json({ ok: true, saved: 0, message: "No pairs to save." });
  }

  let saved = 0;
  for (const pair of pairs) {
    const goalId = pair.goalId && pair.goalId.trim() ? pair.goalId.trim() : null;

    // Patch outflow statement: set pairedStatementId + goalId
    try {
      const outPatch: Record<string, unknown> = {
        pairedStatementId: pair.inStatementId,
        transferFromAccount: pair.fromAccount,
        transferToAccount: pair.toAccount,
      };
      if (goalId !== undefined) outPatch.goalId = goalId ?? "";
      await fetch(`${resolvedBase}/api/collections/statements/records/${pair.outStatementId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify(outPatch),
      });
    } catch {
      console.error(`Failed to patch outflow statement ${pair.outStatementId}`);
    }

    // Patch inflow statement: set pairedStatementId + goalId
    try {
      const inPatch: Record<string, unknown> = {
        pairedStatementId: pair.outStatementId,
        transferFromAccount: pair.fromAccount,
        transferToAccount: pair.toAccount,
      };
      if (goalId !== undefined) inPatch.goalId = goalId ?? "";
      await fetch(`${resolvedBase}/api/collections/statements/records/${pair.inStatementId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify(inPatch),
      });
    } catch {
      console.error(`Failed to patch inflow statement ${pair.inStatementId}`);
    }

    // Update goal currentAmount if goalId is set
    if (goalId) {
      try {
        const filter = encodeURIComponent(`goalId="${goalId}"`);
        const statementsRes = await fetch(
          `${resolvedBase}/api/collections/statements/records?filter=${filter}&perPage=500&fields=amount`,
          { headers: { Authorization: `Bearer ${token}` } }
        );
        const statementsData = (await statementsRes.json()) as { items?: { amount?: number }[] };
        const total = (statementsData.items ?? []).reduce((s, r) => s + Math.abs(r.amount ?? 0), 0);
        await fetch(`${resolvedBase}/api/collections/goals/records/${goalId}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
          body: JSON.stringify({ currentAmount: total }),
        });
      } catch {
        console.error(`Failed to update goal ${goalId} currentAmount`);
      }
    }

    saved++;
  }

  return NextResponse.json({ ok: true, saved });
}
