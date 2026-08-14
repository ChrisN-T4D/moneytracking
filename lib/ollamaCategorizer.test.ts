import assert from "node:assert/strict";
import test from "node:test";
import { categorizeStatementsWithOllama } from "./ollamaCategorizer";

test("force still applies transfer and income heuristics before Ollama", async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = (async () => {
    throw new Error("Ollama should not be called for heuristic rows");
  }) as typeof fetch;

  try {
    const results = await categorizeStatementsWithOllama({
      force: true,
      userOverridesByPattern: new Map(),
      rows: [
        {
          id: "transfer",
          date: "2026-01-01",
          description: "ONLINE TRANSFER REF 123456 TO SAVINGS",
          amount: -50,
        },
        {
          id: "income",
          date: "2026-01-02",
          description: "ACME PAYROLL DIRECT DEPOSIT",
          amount: 1234,
        },
      ],
    });

    assert.deepEqual(results, [
      {
        id: "transfer",
        spendCategory: "Transfer",
        cadence: "transfer",
        confidence: 1,
        categorySource: "heuristic",
      },
      {
        id: "income",
        spendCategory: "Income",
        cadence: "income",
        confidence: 1,
        categorySource: "heuristic",
      },
    ]);
  } finally {
    globalThis.fetch = originalFetch;
  }
});
