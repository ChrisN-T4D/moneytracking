import { NextResponse } from "next/server";
import {
  createCategoryCorrection,
  getStatements,
  updateStatementCategory,
} from "@/lib/pocketbase";
import { getTokenFromCookie } from "@/lib/pocketbase-auth";
import { makeStatementPattern } from "@/lib/statementTagging";
import { isCadence, isSpendCategory } from "@/lib/spendTaxonomy";

export const dynamic = "force-dynamic";

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const token = await getTokenFromCookie().catch(() => null);
  if (!token) {
    return NextResponse.json({ ok: false, message: "Not authenticated." }, { status: 401 });
  }

  const { id } = await params;
  if (!id) {
    return NextResponse.json({ ok: false, message: "Missing id." }, { status: 400 });
  }

  let body: { spendCategory?: string; cadence?: string };
  try {
    body = (await request.json()) as typeof body;
  } catch {
    return NextResponse.json({ ok: false, message: "Invalid JSON body." }, { status: 400 });
  }

  const spendCategory = typeof body.spendCategory === "string" ? body.spendCategory.trim() : "";
  const cadence = typeof body.cadence === "string" ? body.cadence.trim() : "";

  if (!isSpendCategory(spendCategory)) {
    return NextResponse.json({ ok: false, message: "Invalid spendCategory." }, { status: 400 });
  }
  if (!isCadence(cadence)) {
    return NextResponse.json({ ok: false, message: "Invalid cadence." }, { status: 400 });
  }

  const statements = await getStatements({ perPage: 1000, sort: "-date" });
  const statement = statements.find((s) => s.id === id);
  if (!statement) {
    return NextResponse.json({ ok: false, message: "Statement not found." }, { status: 404 });
  }

  const categorizedAt = new Date().toISOString();
  const updated = await updateStatementCategory(id, {
    spendCategory,
    cadence,
    categorySource: "user",
    categoryConfidence: 1,
    categorizedAt,
  });

  if (!updated) {
    return NextResponse.json(
      { ok: false, message: "Failed to update statement category." },
      { status: 502 }
    );
  }

  const correctionOk = await createCategoryCorrection({
    statementId: id,
    pattern: makeStatementPattern(statement.description),
    fromCategory: statement.spendCategory,
    toCategory: spendCategory,
    fromCadence: statement.cadence,
    toCadence: cadence,
    createdAt: categorizedAt,
  });

  if (!correctionOk) {
    return NextResponse.json(
      { ok: false, message: "Category updated but correction record failed." },
      { status: 502 }
    );
  }

  return NextResponse.json({ ok: true });
}
