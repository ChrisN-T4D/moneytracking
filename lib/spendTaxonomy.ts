/**
 * Fixed spend category taxonomy for Ollama prompts, validation, and UI.
 * See docs/superpowers/specs/2026-07-29-statement-analytics-categorizer-design.md
 */

export const SPEND_CATEGORIES = [
  "Food & Dining",
  "Groceries",
  "Transportation",
  "Shopping",
  "Entertainment",
  "Subscriptions",
  "Healthcare",
  "Insurance",
  "Housing",
  "Utilities",
  "Personal Care",
  "Travel",
  "Education",
  "Fees",
  "Financial",
  "Income",
  "Transfer",
  "Charity",
  "Government",
  "Other",
] as const;

export type SpendCategory = (typeof SPEND_CATEGORIES)[number];

export type Cadence = "monthly" | "biweekly" | "variable" | "income" | "transfer";

const SPEND_CATEGORY_SET = new Set<string>(SPEND_CATEGORIES);

export function isSpendCategory(s: string): s is SpendCategory {
  return SPEND_CATEGORY_SET.has(s);
}

export function normalizeSpendCategory(s: string): SpendCategory {
  return isSpendCategory(s) ? s : "Other";
}
