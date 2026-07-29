import assert from "node:assert/strict";
import test from "node:test";
import { buildStatementAnalytics } from "./statementAnalytics";
import type { StatementRecord } from "./types";

function statement(overrides: Partial<StatementRecord>): StatementRecord {
  return {
    id: "base",
    date: "2026-01-01",
    description: "Base statement",
    amount: -1,
    ...overrides,
  };
}

test("buildStatementAnalytics returns latest 500 filtered lines sorted by date desc", () => {
  const many = Array.from({ length: 501 }, (_, index) =>
    statement({
      id: `line-${index}`,
      date: `2026-01-${String((index % 28) + 1).padStart(2, "0")}`,
      description: `Merchant ${index}`,
      amount: -index,
      account: "Checking",
      sourceFile: `file-${index}.csv`,
      spendCategory: index % 2 === 0 ? "Groceries" : null,
      cadence: index % 3 === 0 ? "monthly" : null,
    })
  );
  const excludedBeforeRange = statement({
    id: "before-range",
    date: "2025-12-31",
    description: "Old",
    amount: -20,
    account: "Checking",
  });
  const excludedAccount = statement({
    id: "wrong-account",
    date: "2026-01-31",
    description: "Wrong account",
    amount: -20,
    account: "Savings",
  });

  const analytics = buildStatementAnalytics([excludedBeforeRange, excludedAccount, ...many], {
    from: "2026-01-01",
    to: "2026-01-31",
    account: "Checking",
  });

  assert.equal(analytics.lines.length, 500);
  assert.equal(analytics.lines[0]?.id, "line-27");
  assert.equal(analytics.lines[0]?.date, "2026-01-28");
  assert.deepEqual(analytics.lines[0], {
    id: "line-27",
    date: "2026-01-28",
    description: "Merchant 27",
    amount: -27,
    spendCategory: null,
    cadence: "monthly",
    sourceFile: "file-27.csv",
  });
  assert.ok(!analytics.lines.some((line) => line.id === "before-range"));
  assert.ok(!analytics.lines.some((line) => line.id === "wrong-account"));
  assert.ok(
    analytics.lines.every((line, index, lines) => index === 0 || lines[index - 1]!.date >= line.date)
  );
});
