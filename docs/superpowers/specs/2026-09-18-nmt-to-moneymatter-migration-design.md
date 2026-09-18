# NMT → MoneyMatter full cutover (design)

Date: 2026-09-18  
Status: approved for planning  
Replaces: Neu Money Tracking (NMT) at `nmt.lab.clneu.com`  
New app: [MoneyMatter](https://moneymatter.app/) (self-hosted from [letehaha/budget-tracker](https://github.com/letehaha/budget-tracker))

## Goal

Replace the unreliable NMT + PocketBase stack with self-hosted MoneyMatter as the household finance app. Retire NMT UI and custom paycheck Check-In. Preserve daily SimpleFIN updates and add an MCP-based **“what’s due before next payday”** briefing for Cursor/Hermes.

## Non-goals

- Migrating every NMT PocketBase bill row into MoneyMatter (rebuild from SimpleFIN + manual subscriptions is faster)
- Rebuilding NMT Analyze tab or Ollama brief in Next.js
- Forking MoneyMatter upstream (AGPL-3.0); config and external prompts/skills only unless a small cron patch is unavoidable

## Context

- **NMT today:** Next.js 15 + PocketBase on neu1; paycheck-window Check-In; login/data reliability issues; live at `nmt.lab.clneu.com`.
- **moneyvault today:** SQLite ledger + SimpleFIN sync (Hermes cron 06:30) + `moneyvault-mcp` (:8980) with coarse tools (`money_afford`, `money_coach`, …).
- **MoneyMatter:** Polished Vue/Express app; native SimpleFIN; 80+ MCP tools; self-hosted = all features unlocked.
- **User decision:** Full cutover (not parallel). OK dropping Check-In UI; want MCP “what’s due before next payday” instead.

## Target architecture

```text
SimpleFIN Bridge
       │
       ▼
MoneyMatter (Postgres + Redis)  @ nmt.lab.clneu.com
       │
       ├── SimpleFIN connection (reuse existing access URL claim flow)
       ├── neu1 cron 06:30 → authenticated bank sync trigger
       └── MCP (OAuth, read-only default) → Cursor / Hermes
                 │
                 └── Skill: money-due-before-payday (orchestrates MM tools)

moneyvault (optional, demoted)
       └── money_afford only until ported or dropped; no SimpleFIN cron (MM owns sync)

RETIRED: neu-money-tracking, pocketbase-nmt
```

## Deployment (neu1)

### Stack

Use upstream `budget-tracker/self-hosting/docker-compose.yml`:

| Service | Notes |
|---------|--------|
| `backend` | `letehaha/budget-tracker-be:latest` |
| `frontend` | `letehaha/budget-tracker-fe:latest`; proxies `/api` |
| `db` | Postgres 16 — **volume on `/neuphotos`** (root `/` is ~93% full) |
| `redis` | BullMQ job queue + sync status |
| `currency-rates-api` | Bundled FX sidecar |

### Traefik

- Host: **`nmt.lab.clneu.com`** (reuse NMT hostname — full cutover)
- Join existing `traefik_proxy` network (same pattern as current NMT container)
- Env: `BETTER_AUTH_URL` and `AUTH_ORIGIN` = `https://nmt.lab.clneu.com`
- `MCP_BASE_URL=https://nmt.lab.clneu.com` for external MCP clients
- `SYSTEM_MAX_SIGNUPS_ALLOWED=1` (single household)

### Secrets

Generate via `openssl rand -base64 32`:

- `APPLICATION_JWT_SECRET`
- `APP_SESSION_ID_SECRET`
- `BETTER_AUTH_SECRET`
- `APPLICATION_DB_PASSWORD`

Store in `self-hosting/.env` on neu1 (never commit).

### Cutover sequence

1. Deploy MoneyMatter stack on neu1 (new compose project e.g. `budget-tracker-prod`).
2. Create admin user; connect SimpleFIN (paste setup token or reuse claimed access URL per MM UI).
3. Configure accounts (Checking, Bills, Spanish Fork, cards) and recurring **subscriptions/bills** for known fixed expenses.
4. Verify: login, balances, transactions, manual sync, MCP OAuth from Cursor.
5. **Archive NMT:** export PocketBase (`/neuphotos/backups/nmt-pb-YYYY-MM-DD`), stop `neu-money-tracking` + `pocketbase-nmt`, remove Traefik labels from old containers.
6. Point `nmt.lab.clneu.com` Traefik rule at MoneyMatter frontend only.

## SimpleFIN & daily sync

- **Single sync path:** MoneyMatter only. **Pause** Hermes `simplefin-sync` cron (avoid double-polling SimpleFIN ~24 req/day budget).
- MM default auto-sync: 12h interval when app calls `/bank-data-providers/sync/check`.
- **Required supplement:** neu1 cron at **06:30** calling MM **`POST /api/v1/bank-data-providers/sync/trigger`** with a stored session cookie or refresh token for the household user (self-hosted single-user — acceptable).
- Reuse existing SimpleFIN access URL from `~/moneyvault/secrets/simplefin_access_url` when connecting in MM UI (same Bridge account).

## AI data plane

### Primary: MoneyMatter MCP

- Register in Cursor/Hermes: `https://nmt.lab.clneu.com` MCP endpoint (OAuth, **read** scope default).
- Agents should read MM’s built-in `financial_data_guide` prompt first.
- Prefer structured tools over dumping transactions:
  - `get_accounts`
  - `get_upcoming_subscription_payments`
  - `get_subscriptions_summary`
  - `get_cash_flow`
  - `get_spending_by_categories`
  - `search_transactions` (with date filters only when needed)

### Secondary: moneyvault-mcp (temporary)

- Keep **`money_afford`** only if household afford logic is still wanted before MM budgets subsume it.
- Remove or disable `money_sync` tool usage once MM sync is trusted.
- Long-term: drop moneyvault-mcp or slim to afford-only reading MM-exported snapshot (optional phase 2).

## “What’s due before next payday” MCP prompt

Deliverable: a **Hermes skill** and **Cursor skill** (same content) that agents invoke when user asks about upcoming obligations or paycheck runway.

**File locations (after deploy):**

- `~/stacks/lab-brain/deploy/hermes/skills/money-due-before-payday/SKILL.md`
- Copy or symlink for Cursor: `~/.cursor/skills/` or project rule referencing the skill

**Behavior (agent instructions, not MM fork):**

1. Call `get_user_profile` → base currency.
2. Call `get_accounts` → current balances (note account names: Checking, Bills, etc.).
3. Call `get_upcoming_subscription_payments` with `limit: 30` and types `bill` + `subscription`.
4. Call `get_subscriptions_summary` for monthly recurring totals.
5. Optionally `get_cash_flow` for current month if user asked about runway.
6. **Paycheck window:** If user has configured income subscriptions (Quest biweekly, NWOSU monthly), treat next income subscription payment as “next payday”; else ask user or assume 14-day window from today.
7. **Output format (required):**
   - **Due before next payday** — table: name, amount, date, account/category
   - **Balances vs needs** — checking/bills balances vs sum of due items tagged to each envelope
   - **Risk flag** — any due item exceeding relevant account balance
   - **Facts** — bullet list of tool-returned numbers only (no invented amounts)

**Setup prerequisite in MM:** Create income + expense subscriptions with correct cadence so `get_upcoming_subscription_payments` reflects reality (Quest, NWOSU, mortgage, HOA, etc.).

## Initial data setup (manual, one-time)

| NMT concept | MoneyMatter setup |
|-------------|-------------------|
| Paychecks (Quest, NWOSU) | Subscriptions type `subscription` or income transactions + recurring |
| Bills account envelope | Account “Bills” + bills/subscriptions |
| Checking envelope | Account “Checking” |
| Spanish Fork rental | Account “Spanish Fork” + rental subscriptions |
| Auto transfers | MM transfer transactions or notes (no NMT auto_transfer model) |

Reference NMT PocketBase export and `~/moneyvault/config/debts.yml` while configuring — do not automate migration in v1.

## Retire NMT

After MM verified for 3–7 days of daily use:

- Stop containers: `neu-money-tracking`, `pocketbase-nmt`
- Keep `/neuphotos/pocketbase/pbnmt_data` backup tarball (do not delete for 90 days)
- Mark `moneytracking` repo archived in cursor-memory; note MM as live app
- Optional: README banner pointing to MoneyMatter self-host docs

## Risks & mitigations

| Risk | Mitigation |
|------|------------|
| Root disk full | Postgres/Redis volumes on `/neuphotos` |
| MM sync only when app open | 06:30 cron → sync/trigger |
| SimpleFIN double-sync | Pause moneyvault Hermes cron |
| Lost paycheck-window UX | MCP skill + MM subscriptions |
| AGPL if we modify MM | Avoid fork; external skills/cron only |
| Auth cron fragility | Document session refresh; fallback manual sync in app |

## Success criteria

- [ ] `https://nmt.lab.clneu.com` serves MoneyMatter; NMT containers stopped
- [ ] SimpleFIN connected; transactions appear within 24h of bank activity
- [ ] 06:30 cron runs bank sync without duplicate moneyvault sync
- [ ] Cursor/Hermes MCP read-only works against live data
- [ ] “What’s due before next payday” skill returns grounded answer from MM tools
- [ ] PocketBase backup archived; cursor-memory updated

## Changelog

- **2026-09-18** — Design approved: full cutover to MoneyMatter on `nmt.lab.clneu.com`; MCP paycheck-due skill; moneyvault demoted; NMT retired.
