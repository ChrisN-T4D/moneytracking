# Statement analytics + Ollama categorizer (design)

Date: 2026-07-29  
Status: approved for planning  
App: Neu Money Tracking (`nmt.c.robpneu.com`)

## Goal

Upload a Wells Fargo (or header) CSV and get **persisted spend categories + cadence** via Ollama on neu2, then:

1. **Statements → Analytics deep dive** — cadence buckets, category breakdown, trends, top merchants, new-vs-known, editable line items.
2. **Analyze** — paycheck brief/snapshot uses the same persisted categories (not tag-rule labels) for spend reality.

Tag rules remain for **bill / paycheck / goal linking only**.

## Product choices (locked)

| Choice | Decision |
|--------|----------|
| Placement | **C** — Statements = deep dive; Analyze consumes same categories |
| Categorizer runtime | **B** — Ollama on neu2 (`OLLAMA_BASE_URL` / `OLLAMA_MODEL`) |
| Category authority (v1) | **A** — model ( + heuristics) primary for `spendCategory` / `cadence` |
| Statements v1 depth | **C** — cadence + categories + trends + merchants + new-vs-known |
| Persistence | Snapshot-centric: categorize once, store on statements |
| Later | Confirm-in-UI learning + household-tuned advisor model (out of v1 train loop) |

## Approach

**Numbers first, model for labels.**

1. Import CSV/PDF as today (`/api/statements/import`).
2. UI calls `/api/statements/categorize` for new/uncategorized rows.
3. Ollama returns structured category + cadence per pattern; local date-gap heuristics refine cadence.
4. User overrides win forever for that pattern (`categorySource=user` + corrections collection).
5. `/api/statements/analytics` aggregates without calling the LLM.
6. `buildAnalyzeSnapshot` prefers `spendCategory` for `byCategory` when present.

Rejected:

- Prompt-only Analyze with no persistence (no learning trail; dual categorization stories).
- Separate analytics microservice for v1.
- Hugging Face DistilBERT in-container for v1 (deferred; Ollama path chosen).

## Data model

### `statements` collection — new fields

| Field | Type | Notes |
|-------|------|--------|
| `spendCategory` | text | Taxonomy label (see below) |
| `cadence` | text | `monthly` \| `biweekly` \| `variable` \| `income` \| `transfer` |
| `categorySource` | text | `ollama` \| `user` \| `heuristic` |
| `categoryConfidence` | number | 0–1 optional |
| `categorizedAt` | text/date | ISO when last set |
| `categoryModel` | text | e.g. `qwythos:9b` |

Keep existing `category` field untouched (legacy CSV column if present). Do **not** overload it.

### `statement_category_corrections` collection (new)

| Field | Type |
|-------|------|
| `statementId` | text |
| `pattern` | text (`makeStatementPattern`) |
| `fromCategory` | text (optional) |
| `toCategory` | text |
| `fromCadence` | text (optional) |
| `toCadence` | text |
| `createdAt` | text (ISO) |

When user edits category/cadence in Analytics: update statement (`categorySource=user`) and append a correction. Future categorize runs apply latest user correction per `pattern` before calling Ollama.

### Spend category taxonomy (v1)

Fixed list for prompts + UI:

`Food & Dining`, `Groceries`, `Transportation`, `Shopping`, `Entertainment`, `Subscriptions`, `Healthcare`, `Insurance`, `Housing`, `Utilities`, `Personal Care`, `Travel`, `Education`, `Fees`, `Financial`, `Income`, `Transfer`, `Charity`, `Government`, `Other`

### Cadence meanings

| Cadence | Meaning |
|---------|---------|
| `monthly` | Same pattern ~25–35 day gaps |
| `biweekly` | ~12–16 day gaps or paycheck-aligned |
| `variable` | Irregular / one-off discretionary spend |
| `income` | Inflows (paychecks, refunds treated as income) |
| `transfer` | Account moves / Zelle / Venmo peer transfers (excluded from expense bucket totals) |

Heuristics from statement date gaps for a pattern may override weak model cadence (`confidence < 0.5` or missing).

## APIs

### `POST /api/statements/categorize`

- Auth: session cookie (same as other app APIs that require login; follow existing statements import auth pattern).
- Body: `{ force?: boolean; statementIds?: string[] }`.
- Default: only rows missing `spendCategory` (or missing `cadence`).
- `force`: re-categorize all matching rows except `categorySource=user` unless those IDs are explicitly listed.
- Steps: load statements → apply pattern user overrides → batch remaining to Ollama (JSON array) → merge heuristics → PATCH PocketBase → return `{ ok, categorized, skippedUser, failed, model }`.
- Ollama down: `503` with `{ ok: false, message }`; import remains successful.

### Import behavior

`POST /api/statements/import` unchanged for parse/dedupe. UI after successful import calls categorize for new IDs (avoid stacking work into import `maxDuration`).

### `GET /api/statements/analytics`

- Query: `from?`, `to?`, `account?`.
- Returns app-computed:
  - `byCadence`: totals + counts for expense cadences
  - `byCategory`: totals + counts
  - `trends`: monthly series `{ month, outflow, byCadence }`
  - `topMerchants`: pattern, amount, count, spendCategory, cadence
  - `newSinceLastImport`: patterns whose first seen date equals latest `sourceFile` import cohort (or first categorizedAt batch)
  - `uncategorizedCount`
  - `meta`: date range, statement count, lastCategorizedAt

### `PATCH /api/statements/[id]/category`

- Body: `{ spendCategory, cadence }`.
- Sets `categorySource=user`, `categorizedAt=now`, writes correction row.

### Analyze

Extend `buildAnalyzeSnapshot` spend aggregation: if `statement.spendCategory` is set, use it as `byCategory` label; else fall back to today’s tag-rule labels. Top merchants unchanged (`makeStatementPattern`). Brief/chat prompts unchanged except they naturally see better `byCategory` labels.

## UI — Statements as Analytics

- Route stays `/statements`.
- Page header / primary copy: **Analytics** (nav links that say “Statements” updated to “Analytics” where user-facing).
- Sections (mobile-first, one job each):
  1. Import strip + categorize progress
  2. Cadence overview (Monthly / Biweekly / Variable; Income & Transfers secondary)
  3. Category breakdown (filter by cadence; drill to lines)
  4. Trends (monthly outflow)
  5. Top merchants
  6. New vs known
  7. Line items with inline category/cadence edit
  8. Collapsed **Link to bills & paychecks** (existing fill/tag wizards)

Empty: prompt upload. Ollama down after import: show raw rows + Retry categorize banner.

Do **not** rewrite all 1200+ lines of `app/statements/page.tsx` in place — extract new analytics components and compose; move wizards under a disclosure.

## UI — Analyze

No new upload on Analyze for v1. Snapshot/brief automatically improve when statements are categorized. Optional small note in Facts if `uncategorizedCount > 0`: “N statements not categorized yet.”

## Ollama categorizer prompt (rules)

- Input: compact list `{ id, date, description, amount, pattern }`.
- Output: JSON only — array of `{ id, spendCategory, cadence, confidence }`.
- Categories must be from the fixed taxonomy.
- Do not invent dollar amounts (model only labels).
- Batch size: ~25–40 rows per call to stay within context; group by pattern when possible (one model decision per pattern, apply to all statement IDs sharing it).

## Learning path (v1 hooks only)

v1 stores corrections + `categorySource=user`.  
**Out of v1:** fine-tuning a household model, confirm-every-row UI default, HF DistilBERT deployment.

## Errors & edges

- PocketBase missing new fields: ensure/migration helper (same pattern as `ensurePbPaycheckOverrideFields`) before categorize writes; surface clear error if admin env missing.
- Thin history: cadence mostly `variable`; UI may show low-confidence hint when `categoryConfidence < 0.5`.
- Transfers/income excluded from expense cadence totals.
- Dedupe on import unchanged.

## Out of scope (v1)

- Plaid / bank login automation
- Training/fine-tuning a custom advisor model
- Mandatory human confirm before every category sticks
- Cloud LLM fallback
- Changing Check-In bill math / groceries $250 constant
- In-container HF classifier

## Success criteria

- Upload CSV → categorize → Analytics shows Monthly / Biweekly / Variable totals that match summed line items.
- Editing a category persists, survives refresh, and skips Ollama on next categorize for that pattern.
- Analyze `byCategory` uses `spendCategory` when present.
- Ollama unavailable: import works; categorize fails honestly; analytics still show uncategorized raw data.

## Implementation notes

Likely touchpoints:

- `lib/types.ts` — extend `StatementRecord`
- `lib/pocketbase-setup.ts` + ensure helper for live PB fields / corrections collection
- `lib/pocketbase.ts` — map new fields; update helpers
- `lib/spendTaxonomy.ts` — taxonomy + types
- `lib/cadenceInfer.ts` — gap heuristics
- `lib/ollamaCategorizer.ts` — batch + parse
- `lib/statementAnalytics.ts` — aggregates for GET analytics
- `app/api/statements/categorize/route.ts`
- `app/api/statements/analytics/route.ts`
- `app/api/statements/[id]/category/route.ts`
- New components under `components/analytics/`
- `app/statements/page.tsx` — compose analytics + collapse wizards
- `lib/analyzeSnapshot.ts` — prefer `spendCategory`
- Reuse: `makeStatementPattern`, `ollamaChat`, CSV import, existing auth cookies
