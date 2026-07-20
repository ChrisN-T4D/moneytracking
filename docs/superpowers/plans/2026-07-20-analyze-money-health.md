# Analyze Money Health + Room to Spend — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add deterministic How we’re doing + Room to spend to the Analyze brief (groceries envelope remaining + flexible leftover), without LLM math.

**Architecture:** Shared `lib/groceriesBudget.ts` computes biweekly groceries spend/remaining. `lib/moneyHealth.ts` builds `moneyHealth` from accounts + groceries. `buildAnalyzeSnapshot` attaches it. AnalyzeTab renders health blocks before Cash picture. Ollama prompts forbid inventing these numbers.

**Tech Stack:** Next.js 15, TypeScript, existing PocketBase snapshot pipeline, Ollama narration unchanged for Spend/Cuts.

**Spec:** `docs/superpowers/specs/2026-07-20-analyze-money-health-design.md`

## Global Constraints

- Numbers in moneyHealth are app-computed only; model never recomputes leftover/groceries/status.
- Groceries budget constant is exactly `250`, shared with Check-In.
- Do not edit `app/page.tsx` wholesale (file is huge); only swap the local `250` constant for an import from `lib/groceriesBudget.ts` if a one-line change is safe; otherwise leave page logic and share the constant only.
- Do not invent dollar amounts in Spend reality / Cut list prompts.

---

### Task 1: Shared groceries helper

**Files:**
- Create: `lib/groceriesBudget.ts`
- Modify: `app/page.tsx` — replace local `const GROCERIES_AND_GAS_PER_PAYCHECK = 250` with import of that name from `@/lib/groceriesBudget` (leave spent calculation as-is for this task if file size is a problem; constant sync is the minimum).

**Interfaces:**
- Produces: `GROCERIES_AND_GAS_PER_PAYCHECK`, `GROCERIES_AND_GAS_BILL_KEYS`, `getGroceriesAndGasForPayPeriod(...)`

- [ ] **Step 1:** Create `lib/groceriesBudget.ts` exporting:
  - `GROCERIES_AND_GAS_PER_PAYCHECK = 250`
  - `GROCERIES_AND_GAS_BILL_KEYS` = the three checking bill keys used on Check-In
  - `getGroceriesAndGasForPayPeriod(statements, tagRules, configs, today)` mirroring `app/page.tsx` biweekly window + `computeSpentForBillKeysInDateRange` (period end = next biweekly; start = end − 14 days; if today >= periodEnd, shift window forward one period as page does)
  - Returns `{ budget, spent, remaining, periodStartYmd, periodEndYmd }` with `remaining = max(0, budget - spent)`

- [ ] **Step 2:** Verify with `npx tsc --noEmit` (or project’s typecheck) so the new module compiles.

- [ ] **Step 3:** Commit: `Add shared groceries & gas pay-period helper.`

---

### Task 2: moneyHealth builder + snapshot field

**Files:**
- Create: `lib/moneyHealth.ts`
- Modify: `lib/analyzeSnapshot.ts` — add `moneyHealth` to `AnalyzeSnapshot` and populate before return

**Interfaces:**
- Consumes: groceries helper; `accounts[]`; `nextPaydayLabel`; `dataNotes` array to push gaps
- Produces: `buildMoneyHealth(...)` matching spec field list

- [ ] **Step 1:** Implement `buildMoneyHealth` with flexible formula and status rules from the spec (`tight` / `ok` / `comfortable`, `statusLines`).

- [ ] **Step 2:** In `buildAnalyzeSnapshot`, after `accounts` and groceries inputs exist, call helper + `buildMoneyHealth`, attach `moneyHealth` on the returned object. If checking balance/projected null, note in `dataNotes`.

- [ ] **Step 3:** Verify TypeScript compiles.

- [ ] **Step 4:** Commit: `Add moneyHealth to Analyze snapshot.`

---

### Task 3: AnalyzeTab UI

**Files:**
- Modify: `components/AnalyzeTab.tsx`

- [ ] **Step 1:** When `snapshot?.moneyHealth` exists, render **How we’re doing** (status badge + `statusLines`) and **Room to spend** (groceries left; flexible leftover showing negative when short) **above** Cash picture. Show these even if analyst is down (snapshot present).

- [ ] **Step 2:** In Facts, add status / groceries left / flexible row.

- [ ] **Step 3:** Commit: `Show How we’re doing and Room to spend on Analyze.`

---

### Task 4: Prompt + compact payload

**Files:**
- Modify: `lib/ollamaClient.ts`
- Modify: `app/api/analyze/brief/route.ts` — include `moneyHealth` in compact JSON
- Modify: `app/api/analyze/chat/route.ts` — include `moneyHealth` in compact JSON

- [ ] **Step 1:** Brief system: add rule that UI shows moneyHealth; do not invent leftover/groceries/status.

- [ ] **Step 2:** Chat system: prefer quoting `moneyHealth` for spendable / how-are-we-doing questions.

- [ ] **Step 3:** Commit: `Ground Analyze chat/brief on moneyHealth.`

---

### Task 5: Smoke

- [ ] **Step 1:** `npx tsc --noEmit` passes.
- [ ] **Step 2:** Manual: open Analyze — health blocks visible with numbers; Refresh brief does not invent different leftover dollars.
