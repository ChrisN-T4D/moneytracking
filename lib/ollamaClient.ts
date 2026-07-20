/**
 * Minimal Ollama HTTP client for Analyze brief/chat (neu2).
 */

export function getOllamaConfig(): { baseUrl: string; model: string } {
  const baseUrl = (process.env.OLLAMA_BASE_URL?.trim() || "http://192.168.50.112:11434").replace(
    /\/$/,
    ""
  );
  const model = process.env.OLLAMA_MODEL?.trim() || "qwythos:9b";
  return { baseUrl, model };
}

export class OllamaUnavailableError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "OllamaUnavailableError";
  }
}

export async function ollamaChat(options: {
  system: string;
  messages: { role: "user" | "assistant"; content: string }[];
  timeoutMs?: number;
}): Promise<string> {
  const { baseUrl, model } = getOllamaConfig();
  const timeoutMs = options.timeoutMs ?? 120_000;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const res = await fetch(`${baseUrl}/api/chat`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      signal: controller.signal,
      body: JSON.stringify({
        model,
        stream: false,
        messages: [
          { role: "system", content: options.system },
          ...options.messages,
        ],
      }),
    });
    if (!res.ok) {
      const text = await res.text().catch(() => "");
      throw new OllamaUnavailableError(`Ollama HTTP ${res.status}: ${text.slice(0, 200)}`);
    }
    const data = (await res.json()) as { message?: { content?: string }; error?: string };
    if (data.error) throw new OllamaUnavailableError(data.error);
    const content = (data.message?.content ?? "").trim();
    if (!content) throw new OllamaUnavailableError("Empty model response.");
    return content;
  } catch (e) {
    if (e instanceof OllamaUnavailableError) throw e;
    if (e instanceof Error && e.name === "AbortError") {
      throw new OllamaUnavailableError("Ollama timed out.");
    }
    throw new OllamaUnavailableError(e instanceof Error ? e.message : "Ollama unreachable.");
  } finally {
    clearTimeout(timer);
  }
}

export const ANALYZE_BRIEF_SYSTEM = `You are a household cash-flow analyst for Neu Money Tracking.
You receive a JSON snapshot of REAL numbers for the current paycheck window (today through next payday).
Rules:
- ONLY cite dollar amounts that appear in the snapshot. Never invent totals.
- If dataNotes say data is thin, say so briefly.
- Write THREE short sections with these exact headings:
## Cash picture
## Spend reality
## Cut list
- Cash picture: planned in/out, projected vs required per account, leftover risk.
- Spend reality: this cycle vs prior cycle outflow; top categories/merchants.
- Cut list: 3–5 concrete cuts grounded in largeUpcomingBills and recurringCandidates (subscriptions / repeating patterns), with $ from the snapshot.
- Keep each section to 2–5 short sentences or bullets. No preamble.`;

export const ANALYZE_CHAT_SYSTEM = `You are a household cash-flow analyst for Neu Money Tracking.
Answer using ONLY the provided paycheck snapshot JSON (and optional prior brief).
Rules:
- Never invent dollar amounts; cite snapshot figures only.
- Prefer pointing at largeUpcomingBills and recurringCandidates when asked about big bills or subscriptions to cut.
- Be concise. If the snapshot lacks the answer, say what's missing.`;
