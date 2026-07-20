import { NextResponse } from "next/server";
import { getTokenFromCookie } from "@/lib/pocketbase-auth";
import { buildAnalyzeSnapshot, type AnalyzeSnapshot } from "@/lib/analyzeSnapshot";
import { ANALYZE_CHAT_SYSTEM, ollamaChat, OllamaUnavailableError } from "@/lib/ollamaClient";

export const dynamic = "force-dynamic";
export const maxDuration = 120;

export async function POST(request: Request) {
  const token = await getTokenFromCookie().catch(() => null);
  if (!token) {
    return NextResponse.json({ ok: false, message: "Not authenticated." }, { status: 401 });
  }

  let body: {
    messages?: { role: string; content: string }[];
    briefSections?: { cash: string; spend: string; cuts: string } | null;
  };
  try {
    body = (await request.json()) as typeof body;
  } catch {
    return NextResponse.json({ ok: false, message: "Invalid JSON body." }, { status: 400 });
  }

  const messages = (body.messages ?? [])
    .filter((m) => m && typeof m.content === "string" && (m.role === "user" || m.role === "assistant"))
    .slice(-12)
    .map((m) => ({ role: m.role as "user" | "assistant", content: m.content.slice(0, 4000) }));

  if (messages.length === 0 || messages[messages.length - 1]?.role !== "user") {
    return NextResponse.json({ ok: false, message: "Send at least one user message." }, { status: 400 });
  }

  try {
    const snapshot: AnalyzeSnapshot = await buildAnalyzeSnapshot();
    const compact = {
      window: snapshot.window,
      accounts: snapshot.accounts,
      paychecksNearWindow: snapshot.paychecksNearWindow,
      largeUpcomingBills: snapshot.largeUpcomingBills.slice(0, 15),
      spend: snapshot.spend,
      recurringCandidates: snapshot.recurringCandidates.slice(0, 20),
      dataNotes: snapshot.dataNotes,
    };
    const briefNote = body.briefSections
      ? `\nPrior brief:\nCash: ${body.briefSections.cash}\nSpend: ${body.briefSections.spend}\nCuts: ${body.briefSections.cuts}\n`
      : "";

    const reply = await ollamaChat({
      system: ANALYZE_CHAT_SYSTEM,
      messages: [
        {
          role: "user",
          content: `Snapshot JSON:\n${JSON.stringify(compact)}${briefNote}`,
        },
        ...messages,
      ],
    });

    return NextResponse.json({ ok: true, reply });
  } catch (e) {
    if (e instanceof OllamaUnavailableError) {
      return NextResponse.json(
        { ok: false, analystUnavailable: true, message: e.message },
        { status: 503 }
      );
    }
    return NextResponse.json(
      { ok: false, message: e instanceof Error ? e.message : "Chat failed." },
      { status: 500 }
    );
  }
}
