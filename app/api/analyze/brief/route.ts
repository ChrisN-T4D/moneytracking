import { NextResponse } from "next/server";
import { getTokenFromCookie } from "@/lib/pocketbase-auth";
import { buildAnalyzeSnapshot, type AnalyzeSnapshot } from "@/lib/analyzeSnapshot";
import { ANALYZE_BRIEF_SYSTEM, ollamaChat, OllamaUnavailableError } from "@/lib/ollamaClient";

export const dynamic = "force-dynamic";
export const maxDuration = 120;

type BriefCacheEntry = {
  nextPaydayYmd: string | null;
  sections: { cash: string; spend: string; cuts: string };
  generatedAt: string;
  snapshot: AnalyzeSnapshot;
};

const briefCache = new Map<string, BriefCacheEntry>();

function parseSections(raw: string): { cash: string; spend: string; cuts: string } {
  const spend = sliceSection(raw, "Spend reality", "Cut list");
  const cuts = sliceSection(raw, "Cut list", null);
  // Legacy: if model still emits Cash picture, ignore it for cash (UI uses snapshot).
  return {
    cash: "",
    spend: spend || raw.slice(0, 800),
    cuts: cuts || "",
  };
}

function sliceSection(raw: string, startHeading: string, endHeading: string | null): string {
  const startRe = new RegExp(`##\\s*${startHeading}\\s*`, "i");
  const startMatch = startRe.exec(raw);
  if (!startMatch || startMatch.index == null) return "";
  const from = startMatch.index + startMatch[0].length;
  let to = raw.length;
  if (endHeading) {
    const endRe = new RegExp(`##\\s*${endHeading}\\s*`, "i");
    const endMatch = endRe.exec(raw.slice(from));
    if (endMatch && endMatch.index != null) to = from + endMatch.index;
  }
  return raw.slice(from, to).trim();
}

export async function POST(request: Request) {
  const token = await getTokenFromCookie().catch(() => null);
  if (!token) {
    return NextResponse.json({ ok: false, message: "Not authenticated." }, { status: 401 });
  }

  let force = false;
  try {
    const body = (await request.json().catch(() => ({}))) as { force?: boolean };
    force = Boolean(body.force);
  } catch {
    force = false;
  }

  try {
    const snapshot = await buildAnalyzeSnapshot();
    const cacheKey = `brief:${snapshot.window.nextPaydayYmd ?? "none"}:${snapshot.window.todayYmd}`;
    if (!force) {
      const hit = briefCache.get(cacheKey);
      if (hit && hit.nextPaydayYmd === snapshot.window.nextPaydayYmd) {
        return NextResponse.json({
          ok: true,
          sections: {
            cash: snapshot.cashPictureLines.join("\n"),
            spend: hit.sections.spend,
            cuts: hit.sections.cuts,
          },
          snapshotMeta: {
            todayYmd: snapshot.window.todayYmd,
            nextPaydayYmd: snapshot.window.nextPaydayYmd,
            nextPaydayLabel: snapshot.window.nextPaydayLabel,
          },
          generatedAt: hit.generatedAt,
          cached: true,
          snapshot,
        });
      }
    }

    const compact = {
      window: snapshot.window,
      cashPictureLines: snapshot.cashPictureLines,
      accounts: snapshot.accounts,
      paychecksNearWindow: snapshot.paychecksNearWindow,
      largeUpcomingBills: snapshot.largeUpcomingBills.slice(0, 12),
      mustPayUpcoming: snapshot.mustPayUpcoming.slice(0, 12),
      cutCandidates: snapshot.cutCandidates.slice(0, 15),
      spend: {
        thisCycleOutflow: snapshot.spend.thisCycleOutflow,
        priorCycleOutflow: snapshot.spend.priorCycleOutflow,
        topMerchants: snapshot.spend.topMerchants.slice(0, 8),
        byCategory: snapshot.spend.byCategory.slice(0, 10),
      },
      recurringCandidates: snapshot.recurringCandidates.slice(0, 15),
      dataNotes: snapshot.dataNotes,
      moneyHealth: snapshot.moneyHealth,
    };

    const raw = await ollamaChat({
      system: ANALYZE_BRIEF_SYSTEM,
      messages: [
        {
          role: "user",
          content: `Write Spend reality and Cut list only from this snapshot JSON:\n${JSON.stringify(compact)}`,
        },
      ],
    });

    const parsed = parseSections(raw);
    const sections = {
      cash: snapshot.cashPictureLines.join("\n"),
      spend: parsed.spend,
      cuts: parsed.cuts,
    };
    const generatedAt = new Date().toISOString();
    briefCache.set(cacheKey, {
      nextPaydayYmd: snapshot.window.nextPaydayYmd,
      sections,
      generatedAt,
      snapshot,
    });

    return NextResponse.json({
      ok: true,
      sections,
      snapshotMeta: {
        todayYmd: snapshot.window.todayYmd,
        nextPaydayYmd: snapshot.window.nextPaydayYmd,
        nextPaydayLabel: snapshot.window.nextPaydayLabel,
      },
      generatedAt,
      cached: false,
      snapshot,
    });
  } catch (e) {
    if (e instanceof OllamaUnavailableError) {
      const snapshot = await buildAnalyzeSnapshot().catch(() => null);
      return NextResponse.json(
        {
          ok: false,
          analystUnavailable: true,
          message: e.message,
          snapshot,
        },
        { status: 503 }
      );
    }
    return NextResponse.json(
      { ok: false, message: e instanceof Error ? e.message : "Brief failed." },
      { status: 500 }
    );
  }
}
