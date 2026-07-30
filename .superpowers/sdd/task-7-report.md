# Task 7 Report: Wire `/statements` page as Analytics deep dive

## Summary

- Changed `/statements` page header to `Analytics`.
- Rendered `StatementsAnalyticsView` directly below the page header so the analytics import/categorize/deep-dive experience is first.
- Moved the existing wizard, fill-from-statements section, reset tags, and delete-all utilities into a collapsed `<details>` titled `Link to bills & paychecks`.
- Removed the duplicate standalone import/analyze form outside the wizard because `AnalyticsImportStrip` now provides the page-level import path.
- Preserved `#fill-from-statements` deep linking by opening the details section before scrolling to the hash target.
- Updated page-directed user copy from `Statements page` / `Open statements page` to `Analytics` / `Open Analytics`.

## Files changed

- `app/statements/page.tsx`
- `components/StatementUploadModal.tsx`
- `components/AddPaychecksFromStatementsModal.tsx`
- `components/AddItemsToBillsModal.tsx`
- `.superpowers/sdd/task-7-report.md`

## Verification

- `npx tsc --noEmit` exited `0`.
- `git diff --check` exited `0`.
- Searched TS/TSX files for stale `Statements page`, `statements page`, `Open statements page`, and `Statement uploads` copy; no matches remained.

## Self-review

- Confirmed analytics content is first after the `Analytics` page header.
- Confirmed the wizard's own upload step remains intact inside the collapsible linking area.
- Confirmed `#fill-from-statements` still targets the existing element and opens the details panel on load.
- Confirmed the removed upload UI was the standalone form duplicating `AnalyticsImportStrip`; non-upload utilities were retained.

## Concerns

- No automated browser/UI test exists for the `<details>` hash-scroll behavior; verification was static plus TypeScript.
