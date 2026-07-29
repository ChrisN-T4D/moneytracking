/**
 * Batch statement patterns through Ollama for spend category + cadence labels.
 */

import { inferCadenceFromDates } from "@/lib/cadenceInfer";
import { CATEGORIZE_SYSTEM, ollamaChat } from "@/lib/ollamaClient";
import { makeStatementPattern } from "@/lib/statementTagging";
import { isTransferDescription } from "@/lib/statementsAnalysis";
import {
  type Cadence,
  normalizeSpendCategory,
} from "@/lib/spendTaxonomy";

export type CategorizeInputRow = {
  id: string;
  date: string;
  description: string;
  amount: number;
};

export type CategorizeResultRow = {
  id: string;
  spendCategory: string;
  cadence: Cadence;
  confidence: number;
  categorySource: "ollama" | "heuristic" | "user";
};

const CADENCES: Cadence[] = ["monthly", "biweekly", "variable", "income", "transfer"];
const CADENCE_SET = new Set<string>(CADENCES);
const BATCH_SIZE = 30;

function isCadence(value: string): value is Cadence {
  return CADENCE_SET.has(value);
}

function stripMarkdownFences(text: string): string {
  return text
    .replace(/^```(?:json)?\s*\n?/i, "")
    .replace(/\n?```\s*$/i, "")
    .trim();
}

type PatternGroup = {
  pattern: string;
  rows: CategorizeInputRow[];
};

type OllamaPatternPayload = {
  id: string;
  date: string;
  description: string;
  amount: number;
  pattern: string;
};

type OllamaResponseItem = {
  id?: string;
  spendCategory?: string;
  cadence?: string;
  confidence?: number;
};

function groupRowsByPattern(rows: CategorizeInputRow[]): PatternGroup[] {
  const map = new Map<string, CategorizeInputRow[]>();
  for (const row of rows) {
    const pattern = makeStatementPattern(row.description);
    const existing = map.get(pattern);
    if (existing) {
      existing.push(row);
    } else {
      map.set(pattern, [row]);
    }
  }
  return [...map.entries()].map(([pattern, patternRows]) => ({ pattern, rows: patternRows }));
}

function resolveCadence(
  modelCadence: string | undefined,
  confidence: number,
  dates: string[]
): { cadence: Cadence; cadenceFromHeuristic: boolean } {
  const modelValid = modelCadence !== undefined && isCadence(modelCadence);
  const modelConfident = modelValid && confidence >= 0.5;
  if (modelConfident) {
    return { cadence: modelCadence, cadenceFromHeuristic: false };
  }
  return { cadence: inferCadenceFromDates(dates), cadenceFromHeuristic: true };
}

function parseOllamaResponse(content: string): OllamaResponseItem[] {
  const parsed = JSON.parse(stripMarkdownFences(content)) as unknown;
  if (!Array.isArray(parsed)) {
    throw new Error("Ollama categorizer response is not a JSON array.");
  }
  return parsed as OllamaResponseItem[];
}

function buildPatternResult(
  row: CategorizeInputRow,
  item: OllamaResponseItem,
  dates: string[]
): CategorizeResultRow {
  const spendCategory = normalizeSpendCategory(String(item.spendCategory ?? "Other"));
  const confidence =
    typeof item.confidence === "number" && Number.isFinite(item.confidence)
      ? Math.max(0, Math.min(1, item.confidence))
      : 0;
  const { cadence, cadenceFromHeuristic } = resolveCadence(item.cadence, confidence, dates);
  return {
    id: row.id,
    spendCategory,
    cadence,
    confidence,
    categorySource: cadenceFromHeuristic ? "heuristic" : "ollama",
  };
}

async function categorizePatternBatch(groups: PatternGroup[]): Promise<Map<string, OllamaResponseItem>> {
  const payloads: OllamaPatternPayload[] = groups.map(({ pattern, rows }) => {
    const representative = rows[0]!;
    return {
      id: representative.id,
      date: representative.date,
      description: representative.description,
      amount: representative.amount,
      pattern,
    };
  });

  const content = await ollamaChat({
    system: CATEGORIZE_SYSTEM,
    messages: [{ role: "user", content: JSON.stringify(payloads) }],
  });

  const items = parseOllamaResponse(content);
  const byId = new Map<string, OllamaResponseItem>();
  for (const item of items) {
    if (item.id) byId.set(item.id, item);
  }
  return byId;
}

export async function categorizeStatementsWithOllama(options: {
  rows: CategorizeInputRow[];
  userOverridesByPattern: Map<string, { spendCategory: string; cadence: Cadence }>;
  force?: boolean;
}): Promise<CategorizeResultRow[]> {
  const { rows, userOverridesByPattern, force = false } = options;
  const results: CategorizeResultRow[] = [];
  const ollamaQueue: PatternGroup[] = [];

  for (const group of groupRowsByPattern(rows)) {
    const override = userOverridesByPattern.get(group.pattern);
    if (override) {
      for (const row of group.rows) {
        results.push({
          id: row.id,
          spendCategory: override.spendCategory,
          cadence: override.cadence,
          confidence: 1,
          categorySource: "user",
        });
      }
      continue;
    }

    if (!force && group.rows.some((row) => isTransferDescription(row.description))) {
      for (const row of group.rows) {
        results.push({
          id: row.id,
          spendCategory: "Transfer",
          cadence: "transfer",
          confidence: 1,
          categorySource: "heuristic",
        });
      }
      continue;
    }

    if (!force) {
      const incomeRows = group.rows.filter((row) => row.amount > 0);
      const nonIncomeRows = group.rows.filter((row) => row.amount <= 0);
      for (const row of incomeRows) {
        results.push({
          id: row.id,
          spendCategory: "Income",
          cadence: "income",
          confidence: 1,
          categorySource: "heuristic",
        });
      }
      if (nonIncomeRows.length === 0) continue;
      ollamaQueue.push({ pattern: group.pattern, rows: nonIncomeRows });
      continue;
    }

    ollamaQueue.push(group);
  }

  for (let i = 0; i < ollamaQueue.length; i += BATCH_SIZE) {
    const batch = ollamaQueue.slice(i, i + BATCH_SIZE);
    const byRepresentativeId = await categorizePatternBatch(batch);

    for (const group of batch) {
      const representative = group.rows[0]!;
      const item = byRepresentativeId.get(representative.id) ?? {};
      const dates = group.rows.map((row) => row.date);
      for (const row of group.rows) {
        results.push(buildPatternResult(row, item, dates));
      }
    }
  }

  const order = new Map(rows.map((row, index) => [row.id, index]));
  results.sort((a, b) => (order.get(a.id) ?? 0) - (order.get(b.id) ?? 0));
  return results;
}
