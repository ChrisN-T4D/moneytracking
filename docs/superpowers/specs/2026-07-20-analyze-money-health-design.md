# Analyze brief — money health + room to spend (design)

Date: 2026-07-20  
Status: approved  
App: Neu Money Tracking  
Extends: `docs/superpowers/specs/2026-07-20-analyze-tab-design.md`

## Goal

Make the Analyze paycheck brief answer two questions the current brief does not:

1. **How are we doing?** — a clear health verdict for this paycheck window.
2. **What can we spend on groceries / gas / misc?** — both the Groceries & Gas envelope remaining **and** total flexible leftover after required bills.

Numbers stay app-computed; the model must not invent or recompute these dollars (same rule as Cash picture).

## Product choice (approved)

**Option C:** show both:

- Groceries & Gas envelope remaining (`$250 − spent this pay period`)
- Total flexible leftover after must-pays (and after reserving groceries remaining)

## Approach (approved)

**Numbers-first health block.** Snapshot adds a deterministic `moneyHealth` object + plain `statusLines`. UI always renders **How we’re doing** and **Room to spend** from those fields. Ollama continues to write only **Spend reality** and **Cut list**.

Rejected:

- Asking the model to narrate health / leftover dollars (hallucination risk already seen on cash).
- Only appending sentences into Cash picture (easy to miss; still accounting jargon).

## Snapshot additions

Add to `AnalyzeSnapshot` in `lib/analyzeSnapshot.ts`:

```ts
moneyHealth: {
  status: "tight" | "ok" | "comfortable";
  groceriesBudget: number;       // 250 — same constant as Check-In
  groceriesSpent: number;        // tagged groceries/gas this biweekly pay period
  groceriesRemaining: number;    // max(0, budget - spent)
  flexibleLeftover: number;      // see formula below (may be negative)
  flexibleLeftoverDisplay: number; // max(0, flexibleLeftover) for big UI number
  checkingProjected: number | null;
  checkingRequired: number;
  anyAccountShort: boolean;
  statusLines: string[];         // 2–4 short plain sentences for UI
  payPeriodStartYmd: string | null;
  payPeriodEndYmd: string | null;
};
```

### Groceries spent

Reuse Check-In logic:

- Budget constant: `250` (same as `GROCERIES_AND_GAS_PER_PAYCHECK` on the home page). **Required:** extract a shared constant + helper (e.g. `lib/groceriesBudget.ts`) so Analyze and Check-In cannot drift.
- Period: last biweekly payday → next biweekly payday (same `getNextBiweeklyPayDate` + 14-day window as `app/page.tsx`).
- Spend: `computeSpentForBillKeysInDateRange` for keys  
  `checking_account|bills|groceries`, `…|gas`, `…|groceries & gas`  
  when statements + tag rules exist; otherwise fall back to note in `dataNotes` and spent `0` (or calendar-month paid-by-bill if already available in snapshot builders — prefer tagged range when possible).

### Flexible leftover formula

Using the **checking** account row already on the snapshot:

```
flexibleRaw =
  (checking.projected ?? checking.balance ?? 0)
  - checking.required
  - groceriesRemaining
```

- `flexibleLeftover` = `flexibleRaw` (can be negative → “overcommitted”).
- `flexibleLeftoverDisplay` = `max(0, flexibleRaw)`.

Rationale: projected already includes planned in/out for the window; required is must-pay need; groceries remaining is the envelope still expected to leave checking this period and should not be double-counted as “fun money.”

If checking balance/projected is null, set `flexibleLeftover` to `0`, push a `dataNotes` gap, and status cannot be `comfortable`.

### Status rules

Evaluate in order:

1. **`tight`** if `anyAccountShort` (any account `projected < required` when projected known) **OR** `flexibleLeftover < 0` **OR** `groceriesRemaining === 0 && groceriesSpent >= groceriesBudget`.
2. **`comfortable`** if not tight, all known accounts enough for required, and `flexibleLeftover >= groceriesBudget` (at least another full envelope of slack).
3. Else **`ok`**.

### `statusLines` (deterministic examples)

Built from the numbers above — no LLM:

- Status sentence: e.g. “Tight until {nextPaydayLabel}.” / “On track until {nextPaydayLabel}.” / “Comfortable cushion until {nextPaydayLabel}.”
- Groceries: “Groceries & Gas: ${remaining} left of ${budget} this paycheck (${spent} spent).”
- Flexible: “After must-pays and groceries left, about ${flexibleLeftoverDisplay} flexible for other spending.” (If negative: “Short ~${abs} after must-pays and groceries — cut optionals or delay spend.”)
- Optional fourth line if `anyAccountShort`: name the short account from `accounts[]`.

## UI (`components/AnalyzeTab.tsx`)

Brief section order when `sections` / `snapshot` present:

1. **How we’re doing** — render `moneyHealth.statusLines` (and optional status badge: tight / ok / comfortable). Shown even if Ollama is down (as long as snapshot loaded).
2. **Room to spend** — two large tabular figures:
   - Groceries & Gas left: `groceriesRemaining` of `groceriesBudget`
   - Flexible leftover: show `flexibleLeftover` as-is when negative (e.g. “−$120 short”); otherwise show `flexibleLeftoverDisplay`
3. **Cash picture** — existing `cashPictureLines`
4. **Spend reality** / **Cut list** — model sections (unchanged)

Facts strip: add a compact money-health row (status, groceries left, flexible) for verification.

Loading: health blocks can appear as soon as snapshot is available; do not wait for Ollama if brief path returns snapshot on 503 (already does).

## APIs / prompts

- `buildAnalyzeSnapshot()` fills `moneyHealth`.
- `POST /api/analyze/brief` and chat compact JSON include `moneyHealth` (without needing model to rewrite it).
- `ANALYZE_BRIEF_SYSTEM`: still write **only** Spend reality + Cut list; explicitly say Do not invent leftover / groceries / status — UI shows `moneyHealth`.
- `ANALYZE_CHAT_SYSTEM`: prefer quoting `moneyHealth` for “what can we spend / how are we doing” questions.

Brief response `sections` may stay `{ cash, spend, cuts }`; health is snapshot-only (no model section parsing).

## Out of scope

- Changing the $250 groceries budget in UI
- Monthly spending-cap CRUD
- Replacing Check-In Summary groceries block (keep both in sync via shared constant/helper)
- Model-authored health prose

## Success criteria

- Opening Analyze shows **How we’re doing** + **Room to spend** with dollars that match Facts / Check-In groceries remaining for the same period (within tagging/data gaps called out in `dataNotes`).
- Refresh brief does not change health dollars unless underlying PB data changed.
- Ollama down: health + cash + facts still visible; Spend/Cuts show unavailable.
- No new dollar amounts in Spend/Cuts that are not in the snapshot.

## Implementation notes

- Shared helper preferred: e.g. `getGroceriesAndGasForPayPeriod(statements, tagRules, configs, today) → { budget, spent, remaining, periodStart, periodEnd }` used by Analyze (and optionally later by `page.tsx`).
- Keep `moneyHealth` computation inside `buildAnalyzeSnapshot` after accounts/spend are known.
- Touch files likely: `lib/analyzeSnapshot.ts`, `lib/ollamaClient.ts`, `components/AnalyzeTab.tsx`, optional new `lib/groceriesBudget.ts`, brief/chat routes only if compact payload needs explicit field (snapshot already returned).
