import { NextResponse } from "next/server";
import {
  ensureStatementCategoryFields,
  StatementCategorySchemaError,
} from "@/lib/ensurePbStatementCategoryFields";
import { categorizeStatementsWithOllama } from "@/lib/ollamaCategorizer";
import { getOllamaConfig, OllamaUnavailableError } from "@/lib/ollamaClient";
import {
  getCategoryCorrections,
  getStatements,
  updateStatementCategory,
  verifyStatementCategoryAdminAuth,
} from "@/lib/pocketbase";
import { getTokenFromCookie } from "@/lib/pocketbase-auth";
import type { Cadence } from "@/lib/spendTaxonomy";
import type { StatementRecord } from "@/lib/types";

export const dynamic = "force-dynamic";
export const maxDuration = 120;

function buildUserOverridesByPattern(
  corrections: Awaited<ReturnType<typeof getCategoryCorrections>>
): Map<string, { spendCategory: string; cadence: Cadence }> {
  const map = new Map<string, { spendCategory: string; cadence: Cadence }>();
  for (const correction of corrections) {
    if (!correction.pattern || map.has(correction.pattern)) continue;
    map.set(correction.pattern, {
      spendCategory: correction.toCategory,
      cadence: correction.toCadence as Cadence,
    });
  }
  return map;
}

function selectStatementsForCategorization(
  statements: StatementRecord[],
  options: { force: boolean; statementIds?: string[] }
): { toProcess: StatementRecord[]; skippedUser: number } {
  const { force, statementIds } = options;
  const explicitIdSet = new Set(statementIds ?? []);
  let scoped = statements;
  if (statementIds && statementIds.length > 0) {
    scoped = statements.filter((s) => explicitIdSet.has(s.id));
  }

  const toProcess: StatementRecord[] = [];
  let skippedUser = 0;

  for (const statement of scoped) {
    if (statement.categorySource === "user") {
      skippedUser++;
      continue;
    }

    if (!force && statement.spendCategory && statement.cadence) {
      continue;
    }

    toProcess.push(statement);
  }

  return { toProcess, skippedUser };
}

export async function POST(request: Request) {
  const token = await getTokenFromCookie().catch(() => null);
  if (!token) {
    return NextResponse.json({ ok: false, message: "Not authenticated." }, { status: 401 });
  }

  const pbBase = (process.env.NEXT_PUBLIC_POCKETBASE_URL ?? "").replace(/\/$/, "");
  if (!pbBase) {
    return NextResponse.json(
      { ok: false, message: "NEXT_PUBLIC_POCKETBASE_URL is not set." },
      { status: 400 }
    );
  }

  let force = false;
  let statementIds: string[] | undefined;
  try {
    const body = (await request.json()) as { force?: boolean; statementIds?: string[] };
    force = Boolean(body.force);
    if (Array.isArray(body.statementIds)) {
      statementIds = body.statementIds.filter((id) => typeof id === "string" && id.trim());
    }
  } catch {
    // empty body is valid
  }

  const adminReady = await verifyStatementCategoryAdminAuth();
  if (!adminReady.ok) {
    return NextResponse.json(
      { ok: false, message: adminReady.message },
      { status: adminReady.status }
    );
  }

  try {
    await ensureStatementCategoryFields(pbBase);
  } catch (e) {
    if (e instanceof StatementCategorySchemaError) {
      return NextResponse.json({ ok: false, message: e.message }, { status: e.status });
    }
    return NextResponse.json(
      {
        ok: false,
        message: e instanceof Error ? e.message : "Statement category schema check failed.",
      },
      { status: 500 }
    );
  }

  const [statements, corrections] = await Promise.all([
    getStatements({ perPage: 1000, sort: "-date" }),
    getCategoryCorrections(),
  ]);

  const userOverridesByPattern = buildUserOverridesByPattern(corrections);
  const { toProcess, skippedUser } = selectStatementsForCategorization(statements, {
    force,
    statementIds,
  });

  const { model } = getOllamaConfig();
  let categorized = 0;
  let failed = 0;

  if (toProcess.length === 0) {
    return NextResponse.json({ ok: true, categorized, skippedUser, failed, model });
  }

  try {
    const rows = toProcess.map((s) => ({
      id: s.id,
      date: s.date,
      description: s.description,
      amount: s.amount,
    }));

    const results = await categorizeStatementsWithOllama({
      rows,
      userOverridesByPattern,
      force,
    });

    const categorizedAt = new Date().toISOString();
    for (const result of results) {
      const ok = await updateStatementCategory(result.id, {
        spendCategory: result.spendCategory,
        cadence: result.cadence,
        categorySource: result.categorySource,
        categoryConfidence: result.confidence,
        categorizedAt,
        categoryModel: model,
      });
      if (ok) categorized++;
      else failed++;
    }
  } catch (e) {
    if (e instanceof OllamaUnavailableError) {
      return NextResponse.json({ ok: false, message: e.message }, { status: 503 });
    }
    return NextResponse.json(
      { ok: false, message: e instanceof Error ? e.message : "Categorization failed." },
      { status: 500 }
    );
  }

  if (failed > 0) {
    return NextResponse.json(
      {
        ok: false,
        categorized,
        skippedUser,
        failed,
        model,
        message:
          "Could not persist one or more statement category updates. Verify PocketBase admin credentials and statement category schema fields.",
      },
      { status: 502 }
    );
  }

  return NextResponse.json({ ok: true, categorized, skippedUser, failed, model });
}
