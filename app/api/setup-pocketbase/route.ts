import { NextResponse } from "next/server";
import { runSetup, runSeedOnlyPublic } from "@/lib/pocketbase-setup";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function POST(request: Request) {
  const baseUrl =
    (process.env.POCKETBASE_API_URL ?? "").trim() ||
    (process.env.NEXT_PUBLIC_POCKETBASE_URL ?? "").trim();
  const adminEmail = process.env.POCKETBASE_ADMIN_EMAIL ?? "";
  const adminPassword = process.env.POCKETBASE_ADMIN_PASSWORD ?? "";
  const secret = process.env.SEED_SECRET ?? "";

  if (!baseUrl) {
    return NextResponse.json(
      { ok: false, message: "NEXT_PUBLIC_POCKETBASE_URL (or POCKETBASE_API_URL) is not set." },
      { status: 400 }
    );
  }

  let body: { secret?: string; seedOnly?: boolean; noAdmin?: boolean } = {};
  try {
    const raw = await request.text();
    body = (raw ? JSON.parse(raw) : {}) as { secret?: string; seedOnly?: boolean; noAdmin?: boolean };
  } catch {
    // no body, invalid JSON, or already read
  }
  if (secret) {
    const provided = body?.secret ?? request.headers.get("x-seed-secret") ?? "";
    if (provided !== secret) {
      return NextResponse.json(
        { ok: false, message: "Invalid or missing setup key." },
        { status: 401 }
      );
    }
  }

  // Seed without admin: use when host blocks admin API. Collections must exist and allow create.
  if (body.noAdmin === true) {
    const result = await runSeedOnlyPublic(baseUrl);
    if (!result.ok) {
      return NextResponse.json(
        { ok: false, message: result.message, error: result.error },
        { status: 500 }
      );
    }
    return NextResponse.json(result);
  }

  if (!adminEmail || !adminPassword) {
    return NextResponse.json(
      { ok: false, message: "POCKETBASE_ADMIN_EMAIL and POCKETBASE_ADMIN_PASSWORD must be set in .env.local." },
      { status: 400 }
    );
  }
  const seedOnly = body.seedOnly === true;

  const result = await runSetup({
    baseUrl,
    adminEmail,
    adminPassword,
    seedOnly,
  });

  if (!result.ok) {
    return NextResponse.json(
      { ok: false, message: result.message, error: result.error },
      { status: 500 }
    );
  }
  return NextResponse.json(result);
}
