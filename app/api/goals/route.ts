import { NextResponse } from "next/server";
import { getTokenFromCookie, getPbBase, hasPbAuth } from "@/lib/pocketbase-auth";

export const dynamic = "force-dynamic";

/** Create a new money goal. Body: { name, targetAmount, currentAmount?, targetDate?, category? }. */
export async function POST(request: Request) {
  if (!hasPbAuth()) {
    return NextResponse.json(
      { ok: false, message: "PocketBase is not configured." },
      { status: 400 }
    );
  }
  const token = await getTokenFromCookie();
  if (!token) {
    return NextResponse.json(
      { ok: false, message: "Not authenticated." },
      { status: 401 }
    );
  }
  const base = getPbBase();
  try {
    const body = (await request.json()) as {
      name?: string;
      targetAmount?: number;
      currentAmount?: number;
      targetDate?: string | null;
      category?: string | null;
    };
    const name = (body.name ?? "").trim();
    const targetAmount = Number(body.targetAmount ?? 0);
    const currentAmount = Number(body.currentAmount ?? 0);
    const targetDate = body.targetDate ?? null;
    const category = body.category ?? null;

    if (!name || !Number.isFinite(targetAmount) || targetAmount <= 0) {
      return NextResponse.json(
        { ok: false, message: "name and positive targetAmount are required." },
        { status: 400 }
      );
    }

    const res = await fetch(`${base}/api/collections/goals/records`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({ name, targetAmount, currentAmount, targetDate, category }),
      cache: "no-store",
    });

    if (!res.ok) {
      const text = await res.text();
      return NextResponse.json(
        { ok: false, message: `Create failed: ${res.status} ${text}` },
        { status: 502 }
      );
    }

    const created = (await res.json()) as {
      id: string;
      name?: string;
      targetAmount?: number;
      currentAmount?: number;
      targetDate?: string | null;
      category?: string | null;
    };

    return NextResponse.json({
      ok: true,
      goal: {
        id: created.id,
        name: created.name ?? name,
        targetAmount: Number(created.targetAmount ?? targetAmount),
        currentAmount: Number(created.currentAmount ?? currentAmount),
        targetDate: created.targetDate ?? targetDate,
        category: created.category ?? category,
      },
    });
  } catch (e) {
    return NextResponse.json(
      { ok: false, message: e instanceof Error ? e.message : String(e) },
      { status: 500 }
    );
  }
}

/** Delete a money goal by id (query param ?id=...). */
export async function DELETE(request: Request) {
  if (!hasPbAuth()) {
    return NextResponse.json(
      { ok: false, message: "PocketBase is not configured." },
      { status: 400 }
    );
  }
  const token = await getTokenFromCookie();
  if (!token) {
    return NextResponse.json(
      { ok: false, message: "Not authenticated." },
      { status: 401 }
    );
  }
  const base = getPbBase();
  const url = new URL(request.url);
  const id = url.searchParams.get("id");
  if (!id) {
    return NextResponse.json(
      { ok: false, message: "id query parameter is required." },
      { status: 400 }
    );
  }

  try {
    const res = await fetch(`${base}/api/collections/goals/records/${id}`, {
      method: "DELETE",
      headers: { Authorization: `Bearer ${token}` },
      cache: "no-store",
    });
    if (!res.ok) {
      const text = await res.text();
      const status = res.status === 404 ? 404 : res.status === 403 || res.status === 401 ? res.status : 502;
      return NextResponse.json(
        { ok: false, message: `Delete failed: ${res.status} ${text}` },
        { status }
      );
    }
    return NextResponse.json({ ok: true });
  } catch (e) {
    return NextResponse.json(
      { ok: false, message: e instanceof Error ? e.message : String(e) },
      { status: 500 }
    );
  }
}

