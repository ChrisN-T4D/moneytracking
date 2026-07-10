import { NextResponse } from "next/server";
import { getPbBase, getPbWriteToken } from "@/lib/pocketbase-auth";
import { isPbRecordId, PB } from "@/lib/pbFieldMap";

export const dynamic = "force-dynamic";

type SpanishForkBillUpdateBody = {
  tenantPaid?: boolean;
  amount?: number | null;
  name?: string;
  nextDue?: string;
  frequency?: string;
  recurringPaidCycle?: string | null;
  recurringPaidGoalId?: string | null;
  recurringPaidStatementID?: string | null;
  paycheckAmountOverride?: number | null;
  paycheckAmountOverrideFor?: string | null;
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
  if (!id || !isPbRecordId(id)) {
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
  if (body.recurringPaidCycle !== undefined) {
    const v = body.recurringPaidCycle;
    payload.recurringPaidCycle =
      v === null || (typeof v === "string" && v.trim() === "") ? null : String(v).trim();
  }
  if (body.recurringPaidGoalId !== undefined) {
    const v = body.recurringPaidGoalId;
    payload.recurringPaidGoalId =
      v === null || (typeof v === "string" && v.trim() === "") ? null : String(v).trim();
  }
  if (body.recurringPaidStatementID !== undefined) {
    const v = body.recurringPaidStatementID;
    payload[PB.spanishForkBills.paidStatementId] =
      v === null || (typeof v === "string" && v.trim() === "") ? null : String(v).trim();
  }
  if (body.paycheckAmountOverride !== undefined) {
    const v = body.paycheckAmountOverride;
    if (v === null) {
      payload.paycheckAmountOverride = null;
    } else {
      const n = Number(v);
      if (Number.isNaN(n) || n < 0) {
        return NextResponse.json({ ok: false, message: "paycheckAmountOverride must be non-negative or null." }, { status: 400 });
      }
      payload.paycheckAmountOverride = n;
    }
  }
  if (body.paycheckAmountOverrideFor !== undefined) {
    const v = body.paycheckAmountOverrideFor;
    payload.paycheckAmountOverrideFor =
      v === null || (typeof v === "string" && v.trim() === "") ? null : String(v).trim();
  }

  if (Object.keys(payload).length === 0) {
    return NextResponse.json({ ok: false, message: "No valid fields to update." }, { status: 400 });
  }

  const auth = await getPbWriteToken(base);
  if (!auth) {
    return NextResponse.json(
      { ok: false, message: "Not authenticated. Sign in or set PocketBase admin credentials." },
      { status: 401 }
    );
  }

  const url = `${auth.apiBase}/api/collections/spanish_fork_bills/records/${id}`;
  const res = await fetch(url, {
    method: "PATCH",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${auth.token}`,
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
  const { revalidatePath } = await import("next/cache");
  revalidatePath("/");
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
  if (!id || !isPbRecordId(id)) {
    return NextResponse.json({ ok: false, message: "Invalid id." }, { status: 400 });
  }

  const auth = await getPbWriteToken(base);
  if (!auth) {
    return NextResponse.json(
      { ok: false, message: "Not authenticated. Sign in or set PocketBase admin credentials." },
      { status: 401 }
    );
  }

  const url = `${auth.apiBase}/api/collections/spanish_fork_bills/records/${id}`;
  const res = await fetch(url, {
    method: "DELETE",
    headers: { Authorization: `Bearer ${auth.token}` },
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
