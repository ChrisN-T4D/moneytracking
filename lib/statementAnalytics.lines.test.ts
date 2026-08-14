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

test("buildStatementAnalytics byCategoryByCadence uses full filtered set, not capped lines", () => {
  const many = Array.from({ length: 501 }, (_, index) =>
    statement({
      id: `line-${index}`,
      date: `2026-01-${String((index % 28) + 1).padStart(2, "0")}`,
      description: `Merchant ${index}`,
      amount: -(index + 1),
      account: "Checking",
      spendCategory: index % 2 === 0 ? "Groceries" : "Dining",
      cadence: index % 3 === 0 ? "monthly" : "variable",
    })
  );

  const analytics = buildStatementAnalytics(many, {
    from: "2026-01-01",
    to: "2026-01-31",
    account: "Checking",
  });

  assert.equal(analytics.lines.length, 500);

  const monthlyGroceries = analytics.byCategoryByCadence.monthly?.find(
    (row) => row.category === "Groceries"
  );
  const expectedMonthlyGroceries = many.filter(
    (row) =>
      row.cadence === "monthly" &&
      row.spendCategory === "Groceries" &&
      row.amount < 0
  );

  assert.equal(monthlyGroceries?.count, expectedMonthlyGroceries.length);
  assert.equal(
    monthlyGroceries?.amount,
    expectedMonthlyGroceries.reduce((sum, row) => sum + Math.abs(row.amount), 0)
  );
});

test("buildStatementAnalytics tracks top merchant amounts separately by cadence", () => {
  const analytics = buildStatementAnalytics([
    statement({
      id: "starbucks-monthly",
      date: "2026-01-05",
      description: "PURCHASE AUTHORIZED ON 01/05 STARBUCKS COFFEE OK",
      amount: -4,
      spendCategory: "Food & Dining",
      cadence: "monthly",
    }),
    statement({
      id: "starbucks-variable",
      date: "2026-01-15",
      description: "PURCHASE AUTHORIZED ON 01/15 STARBUCKS COFFEE OK",
      amount: -8,
      spendCategory: "Food & Dining",
      cadence: "variable",
    }),
    statement({
      id: "grocery-monthly",
      date: "2026-01-10",
      description: "PURCHASE AUTHORIZED ON 01/10 LOCAL GROCER OK",
      amount: -25,
      spendCategory: "Groceries",
      cadence: "monthly",
    }),
  ]);

  const combinedStarbucks = analytics.topMerchants.find(
    (row) => row.pattern === "STARBUCKS COFFEE OK"
  );
  assert.equal(combinedStarbucks?.amount, 12);
  assert.equal(combinedStarbucks?.count, 2);

  const monthlyStarbucks = analytics.topMerchantsByCadence.monthly?.find(
    (row) => row.pattern === "STARBUCKS COFFEE OK"
  );
  assert.equal(monthlyStarbucks?.amount, 4);
  assert.equal(monthlyStarbucks?.count, 1);
  assert.equal(monthlyStarbucks?.cadence, "monthly");

  const variableStarbucks = analytics.topMerchantsByCadence.variable?.find(
    (row) => row.pattern === "STARBUCKS COFFEE OK"
  );
  assert.equal(variableStarbucks?.amount, 8);
  assert.equal(variableStarbucks?.count, 1);
  assert.equal(variableStarbucks?.cadence, "variable");
});
