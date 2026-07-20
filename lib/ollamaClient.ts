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
- ONLY cite dollar amounts that appear in the snapshot JSON. Never invent or recompute totals.
- Do NOT write a Cash picture section — the app already shows cashPictureLines. Skip it.
- Do NOT invent leftover, groceries remaining, or status — the app shows moneyHealth. Skip How we're doing / Room to spend.
- Write ONLY these two headings:
## Spend reality
## Cut list
- Spend reality: compare spend.thisCycleOutflow vs spend.priorCycleOutflow; mention topMerchants/byCategory if present. Planned bill outflows are NOT the same as recorded statement spend — say so if spend is $0 but bills are due.
- Cut list: 3–5 concrete cuts. ONLY use cutCandidates (optional items). NEVER suggest cutting mustPayUpcoming or anything with isEssential=true (life insurance, tithing, utilities, etc.). Prefer dueInWindow cutCandidates and monthly subs; for yearly quote monthlyEquivalent.
- Keep each section to 2–5 short sentences or bullets. No preamble.`;

export const ANALYZE_CHAT_SYSTEM = `You are a household cash-flow analyst for Neu Money Tracking.
Answer using ONLY the provided paycheck snapshot JSON (and optional prior brief).
Rules:
- Never invent or recompute dollar amounts; quote moneyHealth, accounts[], paychecksNearWindow, largeUpcomingBills, spend, recurringCandidates only.
- Prefer cashPictureLines / accounts[].projected over mental math.
- Prefer pointing at cutCandidates for what to cut; mustPayUpcoming are necessary (never suggest cutting them).
- Yearly subscriptions: the listed amount is annual; use monthlyEquivalent for monthly impact.
- For "what can we spend" / "how are we doing", prefer moneyHealth (groceriesRemaining, flexibleLeftover, statusLines).
- Be concise. If the snapshot lacks the answer, say what's missing.`;
