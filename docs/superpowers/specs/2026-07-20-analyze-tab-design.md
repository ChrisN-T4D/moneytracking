# Analyze tab — paycheck brief + chat (design)

Date: 2026-07-20  
Status: approved for planning  
App: Neu Money Tracking (`nmt.c.robpneu.com`)

## Goal

Help the household understand cash flow for the **current paycheck window** (today through next payday), with an LLM that **explains numbers the app already computed** — including big upcoming bills and recurring/subscription-like spend that can be cut. Not a calendar-month budget UI in v1; not model-invented totals.

## Product

New main-nav tab: **Analyze** (alongside Check-In, Goals, Bills).

1. **Paycheck brief** (on open / Refresh): three short sections
   - **Cash picture** — planned in/out, leftover risk, enough-by-account
   - **Spend reality** — tagged outflow this cycle vs prior cycle; top merchants/categories
   - **Cut list** — 3–5 concrete trim opportunities with $ amounts grounded in the snapshot
2. **Chat** — follow-ups on the same snapshot + brief (e.g. “What big bills are coming?”, “Which subscriptions can we cut?”)
3. **Facts strip** (collapsible) — raw snapshot highlights so the user can verify prose against numbers

v1 explicitly **does not** include monthly spending-cap editing UI.

## Approach

**Numbers first, model second.**

- Server builds a compact **paycheck snapshot** JSON from PocketBase.
- Ollama on **neu2** (`qwythos:9b`) only narrates / answers from that JSON.
- Chat has no tool calling in v1; context = snapshot + last brief + messages.

Rejected alternatives:

- Dumping raw statements into the prompt as the primary source of truth (hallucinated totals).
- Separate analyst microservice on neu2 for v1 (extra deploy; defer).

## Snapshot contents

Built for window `[todayYmd, nextPaydayYmd]` (same next-payday schedule as Check-In / Recurring).

Include at least:

| Block | Source |
|--------|--------|
| Window + next payday label | Existing paycheck schedule helpers |
| Account balances + planned in/out + projected | Summary + bills/transfers in window (same ideas as Account outlook; exclude marked-paid from planned out) |
| Large upcoming bills | Bills / Spanish Fork / subscriptions due in window, sorted by amount desc |
| Spend this cycle vs prior cycle | Tagged statements in window vs the immediately previous paycheck window (prior payday → day before current window start) |
| Top merchants / patterns | Statement descriptions aggregated via existing `makeStatementPattern` |
| Recurring / subscription candidates | (1) Bills with subscription listType + monthly-ish frequency (2) Untagged or tagged patterns that repeat ≥ 3 times in the last ~90 days with similar amounts |
| Paychecks expected in / near window | Paycheck configs |

Amounts in the snapshot are authoritative. The model must cite them, not invent new figures.

## APIs

### `GET /api/analyze/snapshot`

- Auth: same session cookie as rest of app.
- Returns snapshot JSON (also used by UI Facts strip without calling Ollama).

### `POST /api/analyze/brief`

- Auth required.
- Body: optional `{ force?: boolean }`.
- Builds snapshot (or reuses), calls Ollama with fixed system prompt requesting three labeled sections.
- Response: `{ ok, sections: { cash, spend, cuts }, snapshotMeta, generatedAt }`.
- Cache: in-memory or PocketBase record keyed by user + `nextPaydayYmd` until force refresh or payday changes.
- Timeout: fail soft (see Errors).

### `POST /api/analyze/chat`

- Auth required.
- Body: `{ messages: { role, content }[], snapshot? }` (server may rebuild snapshot if omitted).
- Streams or returns assistant text grounded in snapshot + last brief.
- Starter chips are UI-only; they send normal chat messages.

## Ollama / deploy

| Env | Purpose |
|-----|---------|
| `OLLAMA_BASE_URL` | e.g. `http://192.168.50.112:11434` (neu2 LAN; verified reachable from neu1 host) |
| `OLLAMA_MODEL` | default `qwythos:9b` |

- Set in Portainer stack env for `neu-money-tracking` (never commit secrets; URL is not secret but stays in stack.env).
- Confirm **container** can reach neu2 (if host works but container does not: extra_hosts, host network, or firewall).
- Do not send PocketBase admin credentials or raw env secrets to the model.

## UI

- Extend `TabLayout` with Analyze tab.
- Header: “Through {payday}” + Refresh brief.
- Brief: three compact sections; skeleton while generating.
- Collapsible Facts: largest bills, recurring candidates with $.
- Chat thread + input + starter chips under brief.
- Match existing card / theme patterns; mobile-first.

## Errors & edges

- Ollama down / timeout: Facts strip still works; brief/chat show “Analyst unavailable” + Retry; no fabricated advice.
- Thin statement/tag data: brief states gaps; still summarizes bills/paychecks from PB.
- Prompt: forbid inventing dollar amounts; if unknown, say so.
- Marked-paid bills: treat like Account outlook (excluded from planned out).

## Out of scope (v1)

- Monthly spending cap CRUD / enforcement UI
- Cloud LLM fallback
- Auto-creating bills from chat
- Changing bank connections / Plaid
- Separate neu2 analyst service

## Success criteria

- User opens Analyze and gets a three-section brief for the current paycheck window without manual prompt engineering.
- Asking about big bills or cuttable subscriptions returns answers consistent with the Facts strip / snapshot.
- When Ollama is unavailable, numbers remain visible and the UI fails honestly.
- No new dollars appear in the brief that are not in the snapshot.

## Implementation notes (for planning)

Likely touchpoints:

- `components/TabLayout.tsx` — new tab
- New `components/AnalyzeTab.tsx` (or similar)
- New `lib/analyzeSnapshot.ts` — snapshot builder
- New `app/api/analyze/{snapshot,brief,chat}/route.ts`
- `docker-compose` / Portainer env docs for Ollama vars
- Reuse: `getNextPaydayFromSchedule`, statement tagging patterns, Recurring planned in/out logic, auth helpers
