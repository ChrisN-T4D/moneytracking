# Task 6 Report: Analytics UI components

## Status

DONE_WITH_CONCERNS

## Summary

- Extended `StatementAnalytics` with `lines` containing `id`, `date`, `description`, `amount`, `spendCategory`, `cadence`, and `sourceFile`.
- `buildStatementAnalytics` now returns filtered statement lines sorted by date descending and capped at 500.
- Added focused regression coverage for analytics lines filtering, shape, sort order, and cap.
- Created the requested `components/analytics/` files:
  - `AnalyticsImportStrip.tsx`
  - `CadenceOverview.tsx`
  - `CategoryBreakdown.tsx`
  - `TrendsSection.tsx`
  - `TopMerchantsSection.tsx`
  - `NewVsKnownSection.tsx`
  - `LineItemsTable.tsx`
  - `StatementsAnalyticsView.tsx`
- `StatementsAnalyticsView` owns analytics fetch, categorize calls, inline category PATCH updates, refresh state, and cadence filter state.
- Did not modify `app/statements/page.tsx`; Task 7 can wire the view.

## Verification

- RED before implementation:
  - `npx tsx --test "lib/statementAnalytics.lines.test.ts"`
  - Failed because `analytics.lines` was undefined.
- GREEN after implementation:
  - `npx tsx --test "lib/statementAnalytics.lines.test.ts"`
  - Result: 1 test passed.
- Required typecheck:
  - `npx tsc --noEmit`
  - Result: exit code 0.

## Self-review

- Confirmed import/categorize/update fetches use `credentials: "include"`.
- Confirmed spend category edit dropdown uses `SPEND_CATEGORIES` from `@/lib/spendTaxonomy`.
- Confirmed cadence edit dropdown includes `monthly`, `biweekly`, `variable`, `income`, `transfer`.
- Confirmed CSS bars are Tailwind/inline width only; no chart dependency added.
- Confirmed `app/statements/page.tsx` remains untouched.

## Concern

- When a cadence filter is selected, `CategoryBreakdown` derives filtered category totals from `analytics.lines`, which is capped at 500 rows. Unfiltered category totals still use the full aggregate from `StatementAnalytics`.
