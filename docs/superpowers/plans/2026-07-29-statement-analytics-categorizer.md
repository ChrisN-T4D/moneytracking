# Statement Analytics + Ollama Categorizer — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Persist Ollama spend categories + cadence on statements, power a Statements Analytics deep dive, and feed Analyze snapshot category totals from the same fields.

**Architecture:** After CSV import, `/api/statements/categorize` labels rows via neu2 Ollama (user pattern overrides first, date-gap heuristics for cadence). `/api/statements/analytics` aggregates without the LLM. Statements page becomes Analytics UI; Analyze prefers `spendCategory` over tag-rule labels.

**Tech Stack:** Next.js 15, TypeScript, PocketBase, existing `ollamaChat` on neu2, Tailwind UI patterns already in the app.

**Spec:** `docs/superpowers/specs/2026-07-29-statement-analytics-categorizer-design.md`

## Global Constraints

- Do not use tag rules as the source of `spendCategory` / `cadence` (rules stay for bill/paycheck linking only).
- Do not overload legacy `category` CSV field; use new `spendCategory`.
- Do not call Ollama inside `/api/statements/import` (UI calls categorize after import).
- Do not rewrite all of `app/statements/page.tsx` in one edit — extract components under `components/analytics/` (page is ~1200 lines).
- Numbers in analytics aggregates are app-computed; Ollama only assigns labels.
- Prefer `npx tsc --noEmit` for verification (no Jest in repo). Pure helpers may also use `node --import tsx` only if already available; otherwise verify with `tsc` + small `node -e` against compiled logic duplicated in a `.mjs` smoke only when needed — default to `tsc`.

## File map

| File | Role |
|------|------|
| `lib/spendTaxonomy.ts` | Fixed category list + cadence union + validators |
| `lib/cadenceInfer.ts` | Infer cadence from date gaps per pattern |
| `lib/ollamaCategorizer.ts` | Batch prompt, parse JSON, merge heuristics |
| `lib/statementAnalytics.ts` | Aggregates for Analytics API |
| `lib/ensurePbStatementCategoryFields.ts` | Ensure PB fields + corrections collection |
| `lib/types.ts` | Extend `StatementRecord` |
| `lib/pocketbase.ts` | Map/PATCH new fields; corrections create |
| `lib/pocketbase-setup.ts` | Schema for fresh setups |
| `lib/analyzeSnapshot.ts` | Prefer `spendCategory` in spend rollup |
| `app/api/statements/categorize/route.ts` | Categorize endpoint |
| `app/api/statements/analytics/route.ts` | Analytics endpoint |
| `app/api/statements/[id]/category/route.ts` | User correction endpoint |
| `components/analytics/*` | Deep-dive UI sections |
| `app/statements/page.tsx` | Compose Analytics + collapse wizards |

---

### Task 1: Taxonomy + cadence helpers

**Files:**
- Create: `lib/spendTaxonomy.ts`
- Create: `lib/cadenceInfer.ts`

**Interfaces:**
- Produces:
  - `SPEND_CATEGORIES` string array (exact list from spec)
  - `SpendCategory` type
  - `Cadence` = `"monthly" | "biweekly" | "variable" | "income" | "transfer"`
  - `isSpendCategory(s: string): s is SpendCategory`
  - `normalizeSpendCategory(s: string): SpendCategory` (unknown → `"Other"`)
  - `inferCadenceFromDates(dates: string[]): Cadence` — ISO or parseable dates; avg gap 12–16 → biweekly; 25–35 → monthly; else variable. Fewer than 2 dates → `"variable"`.

- [ ] **Step 1:** Implement `lib/spendTaxonomy.ts` with the exact taxonomy from the spec.

- [ ] **Step 2:** Implement `lib/cadenceInfer.ts`:
  - Sort unique dates ascending
  - Compute consecutive day gaps
  - Average gap → cadence rules above
  - Export `inferCadenceFromDates`

- [ ] **Step 3:** Verify: `npx tsc --noEmit` passes (or reports no errors in these files).

- [ ] **Step 4:** Commit: `Add spend taxonomy and cadence inference helpers.`

---

### Task 2: Types + PocketBase schema mapping

**Files:**
- Modify: `lib/types.ts` — extend `StatementRecord`
- Modify: `lib/pocketbase.ts` — `PbStatement`, `mapStatementsResponse`
- Modify: `lib/pocketbase-setup.ts` — statements fields + new collection
- Create: `lib/ensurePbStatementCategoryFields.ts`

**Interfaces:**
- `StatementRecord` gains optional: `spendCategory`, `cadence`, `categorySource`, `categoryConfidence`, `categorizedAt`, `categoryModel` (all nullable strings/numbers as appropriate).
- Produces: `ensureStatementCategoryFields(pbBase: string): Promise<void>` that adds missing fields on `statements` and creates `statement_category_corrections` if absent (mirror `ensurePbPaycheckOverrideFields.ts` admin PATCH pattern).
- Produces: `updateStatementCategory(id, fields)` and `createCategoryCorrection(row)` in `lib/pocketbase.ts` (or same ensure module) using admin token when configured.

- [ ] **Step 1:** Extend `StatementRecord` and PB mappers so reads include the new fields when present.

- [ ] **Step 2:** Update `pocketbase-setup.ts` statements field list + add `statement_category_corrections` collection definition for fresh installs.

- [ ] **Step 3:** Implement `ensureStatementCategoryFields` for live PB.

- [ ] **Step 4:** `npx tsc --noEmit`

- [ ] **Step 5:** Commit: `Add statement category fields to types and PocketBase setup.`

---

### Task 3: Ollama categorizer library

**Files:**
- Create: `lib/ollamaCategorizer.ts`
- Modify: `lib/ollamaClient.ts` — export a `CATEGORIZE_SYSTEM` constant (keep brief/chat prompts intact)

**Interfaces:**
- Consumes: `ollamaChat`, `makeStatementPattern` from `lib/statementTagging.ts`, taxonomy + `inferCadenceFromDates`
- Produces:
  ```ts
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

  export async function categorizeStatementsWithOllama(options: {
    rows: CategorizeInputRow[];
    userOverridesByPattern: Map<string, { spendCategory: string; cadence: Cadence }>;
    force?: boolean;
  }): Promise<CategorizeResultRow[]>;
  ```
- Group by `makeStatementPattern(description)`; apply user override to all IDs in pattern without Ollama.
- For remaining patterns, batch ≤ 30 unique patterns per `ollamaChat` call; system prompt requires JSON array only with taxonomy + cadence enums.
- Parse JSON (strip markdown fences if present). Invalid category → `Other`. If model cadence missing/low confidence (`< 0.5`), replace cadence with `inferCadenceFromDates` for that pattern’s dates and set `categorySource` to `heuristic` when cadence came from heuristic only; if both from model, `ollama`.
- Amount sign: if `amount > 0` and not clearly transfer pattern, prefer category `Income` / cadence `income` unless override says otherwise; transfers via existing `isTransferDescription` → `Transfer` / `transfer` without Ollama when heuristic is clear.

- [ ] **Step 1:** Add `CATEGORIZE_SYSTEM` string in `ollamaClient.ts`.

- [ ] **Step 2:** Implement `categorizeStatementsWithOllama` with batching + merge rules above.

- [ ] **Step 3:** `npx tsc --noEmit`

- [ ] **Step 4:** Commit: `Add Ollama statement categorizer.`

---

### Task 4: Categorize + correction APIs

**Files:**
- Create: `app/api/statements/categorize/route.ts`
- Create: `app/api/statements/[id]/category/route.ts`

**Interfaces:**
- `POST /api/statements/categorize` body `{ force?: boolean; statementIds?: string[] }`
- Loads statements via `getStatements({ perPage: 1000, sort: "-date" })`
- Calls `ensureStatementCategoryFields` first
- Loads corrections (latest per pattern wins) into `userOverridesByPattern`
- Filters rows needing work; runs categorizer; PATCHes each statement with fields + `categorizedAt` ISO + `categoryModel` from `getOllamaConfig().model`
- On `OllamaUnavailableError` return 503 `{ ok: false, message }`
- Success: `{ ok: true, categorized, skippedUser, failed, model }`
- `PATCH /api/statements/[id]/category` body `{ spendCategory, cadence }` validates taxonomy/cadence, updates statement `categorySource=user`, appends correction

- [ ] **Step 1:** Implement categorize route.

- [ ] **Step 2:** Implement PATCH category route.

- [ ] **Step 3:** `npx tsc --noEmit`

- [ ] **Step 4:** Commit: `Add statement categorize and category correction APIs.`

---

### Task 5: Analytics aggregate library + GET API

**Files:**
- Create: `lib/statementAnalytics.ts`
- Create: `app/api/statements/analytics/route.ts`

**Interfaces:**
- Produces:
  ```ts
  export type StatementAnalytics = {
    byCadence: { cadence: string; amount: number; count: number }[];
    byCategory: { category: string; amount: number; count: number }[];
    trends: { month: string; outflow: number; byCadence: Record<string, number> }[];
    topMerchants: {
      pattern: string;
      amount: number;
      count: number;
      spendCategory: string | null;
      cadence: string | null;
    }[];
    newSinceLastImport: { pattern: string; amount: number; count: number }[];
    uncategorizedCount: number;
    meta: {
      from: string | null;
      to: string | null;
      statementCount: number;
      lastCategorizedAt: string | null;
    };
  };

  export function buildStatementAnalytics(
    statements: StatementRecord[],
    options?: { from?: string; to?: string; account?: string }
  ): StatementAnalytics;
  ```
- Expense totals use `Math.abs(amount)` for `amount < 0` only; exclude `cadence` in `income`|`transfer` (and uncategorized positive income) from expense cadence buckets.
- `newSinceLastImport`: take latest `sourceFile` among statements; patterns that appear only in that file (or whose earliest date is in that file’s set) go in new list.
- GET route: parse query, `getStatements`, return `{ ok: true, analytics }`.

- [ ] **Step 1:** Implement `buildStatementAnalytics`.

- [ ] **Step 2:** Implement GET route.

- [ ] **Step 3:** `npx tsc --noEmit`

- [ ] **Step 4:** Commit: `Add statement analytics builder and API.`

---

### Task 6: Analytics UI components

**Files:**
- Create: `components/analytics/AnalyticsImportStrip.tsx`
- Create: `components/analytics/CadenceOverview.tsx`
- Create: `components/analytics/CategoryBreakdown.tsx`
- Create: `components/analytics/TrendsSection.tsx`
- Create: `components/analytics/TopMerchantsSection.tsx`
- Create: `components/analytics/NewVsKnownSection.tsx`
- Create: `components/analytics/LineItemsTable.tsx`
- Create: `components/analytics/StatementsAnalyticsView.tsx` (composes the above + fetches analytics/categorize)

**Behavior:**
- `AnalyticsImportStrip`: multi-file upload like current page (POST import), then POST categorize with imported flow; show progress/errors; “Retry categorize” button.
- Other sections render from `StatementAnalytics` + optional selected cadence filter.
- `LineItemsTable`: client list of statements (fetch from analytics response or a light statements list embedded in analytics GET — if needed, extend analytics response with `lines: { id, date, description, amount, spendCategory, cadence }[]` capped at 500). Prefer extending analytics with `lines` in this task if LineItems needs it — update `StatementAnalytics` type accordingly.
- Inline edit calls `PATCH /api/statements/[id]/category`, then refreshes analytics.
- Match existing dark/light neutral Tailwind patterns from `StatementUploadModal` / `AnalyzeTab`.

- [ ] **Step 1:** Add `lines` to analytics type + builder (id, date, description, amount, spendCategory, cadence, sourceFile) sorted by date desc, max 500.

- [ ] **Step 2:** Build compose view + sections (can be visually simple lists; charts optional — CSS bar width by share is enough).

- [ ] **Step 3:** `npx tsc --noEmit`

- [ ] **Step 4:** Commit: `Add Statements Analytics UI components.`

---

### Task 7: Wire `/statements` page as Analytics deep dive

**Files:**
- Modify: `app/statements/page.tsx`
- Modify: user-facing “Statements” copy in links/modals that point users here (e.g. `StatementUploadModal` “Open statements page” → “Open Analytics”; any header link if present)

**Behavior:**
- Page title/header: **Analytics**
- Top: `StatementsAnalyticsView`
- Below in a collapsed `<details>` (default closed): existing fill-from-statements / tagging wizard UI currently on the page (cut/paste into details without re-implementing logic)
- Remove duplicate bare upload if the import strip covers it; keep one upload path

- [ ] **Step 1:** Compose page: Analytics first, wizards under “Link to bills & paychecks”.

- [ ] **Step 2:** Update user-facing copy Statements → Analytics where it refers to this page.

- [ ] **Step 3:** `npx tsc --noEmit`

- [ ] **Step 4:** Commit: `Make Statements page the Analytics deep dive.`

---

### Task 8: Analyze snapshot uses spendCategory

**Files:**
- Modify: `lib/analyzeSnapshot.ts` — function that currently builds `byCategory` via `suggestTagsForStatements` (around the spend helper near lines 130–178)

**Behavior:**
- For each outflow statement in range: if `spendCategory` is non-empty, add to `byCategory` under that label; else keep existing tag-rule label logic.
- Merchants still use `makeStatementPattern`.
- Optional: push dataNote if many rows lack `spendCategory` (e.g. uncategorizedCount > 0 in window).

- [ ] **Step 1:** Prefer `spendCategory` in spend rollup.

- [ ] **Step 2:** `npx tsc --noEmit`

- [ ] **Step 3:** Commit: `Use persisted spendCategory in Analyze snapshot.`

---

### Task 9: Smoke verification

- [ ] **Step 1:** `npx tsc --noEmit` — clean.

- [ ] **Step 2:** `npm run lint` — no new errors in touched files (fix pre-existing if unrelated).

- [ ] **Step 3:** Manual checklist (when PB + Ollama available):
  - Upload Wells CSV → categorize succeeds → Cadence + Category sections non-empty
  - Edit one line category → refresh → still user value; re-categorize skips it
  - Analyze brief `byCategory` shows taxonomy labels for categorized spend
  - Stop Ollama → categorize returns 503; import still works

---

## Spec coverage check

| Spec requirement | Task |
|------------------|------|
| Persist spendCategory/cadence/source/confidence/model | 2, 3, 4 |
| Corrections collection + user overrides | 2, 4 |
| Ollama batch categorizer + heuristics | 1, 3 |
| Categorize API; import then UI categorize | 4, 6 |
| Analytics API (cadence, category, trends, merchants, new) | 5 |
| Statements deep-dive UI | 6, 7 |
| Analyze uses spendCategory | 8 |
| Learning hooks only (no fine-tune) | 4 corrections |
| Ollama failure soft-fail | 4, 6 |
