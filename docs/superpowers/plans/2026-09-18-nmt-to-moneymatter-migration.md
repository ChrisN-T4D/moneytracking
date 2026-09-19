# NMT → MoneyMatter full cutover — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Replace NMT on `nmt.lab.clneu.com` with self-hosted MoneyMatter, add paycheck-due MCP skill, daily SimpleFIN sync cron, retire NMT/PocketBase.

**Architecture:** Official `budget-tracker/self-hosting` compose on neu1; Postgres/Redis bind-mounted under `/neuphotos/moneymatter/`; Traefik via docker labels on frontend (same pattern as NMT); Hermes/Cursor skill orchestrates MM MCP tools for "what's due before next payday".

**Tech Stack:** Docker Compose, MoneyMatter published images, Traefik, SimpleFIN, Hermes cron.

## Global Constraints

- Hostname: `https://nmt.lab.clneu.com` (full cutover, no parallel hostname)
- Household signups: `SYSTEM_MAX_SIGNUPS_ALLOWED=2`, `ADMIN_USERS=chris`
- Root URL → `/sign-in` via Traefik redirect (not Astro landing)
- Pause moneyvault Hermes `simplefin-sync` cron (MM owns SimpleFIN)
- Do not fork MoneyMatter (AGPL); external compose override + skills only
- Volumes on `/neuphotos` (root disk ~93% full)

---

### Task 1: Scaffold MoneyMatter stack on neu1

**Files:**
- Create: `/home/chris/stacks/moneymatter/self-hosting/` (clone upstream self-hosting)
- Create: `/home/chris/stacks/moneymatter/docker-compose.override.yml`
- Create: `/home/chris/stacks/moneymatter/self-hosting/.env` (secrets, gitignored)

**Steps:**
1. Shallow clone `letehaha/budget-tracker` or copy `self-hosting/` folder
2. Generate secrets (`openssl rand -base64 32` × 4)
3. Set `BETTER_AUTH_URL` / `AUTH_ORIGIN` / `MCP_BASE_URL` to `https://nmt.lab.clneu.com`
4. Override: bind mounts for `db_data`, `redis_data`, `currency_rates_data` → `/neuphotos/moneymatter/`
5. Override: frontend joins `traefik_proxy`, Traefik labels for `nmt.lab.clneu.com`, `HTTP_PORT=127.0.0.1:8080`

**Verify:** `docker compose up -d` && `curl -sf http://127.0.0.1:8080/` returns HTML

---

### Task 2: Cut over Traefik (stop NMT)

**Steps:**
1. Stop `neu-money-tracking` and `pocketbase-nmt`
2. Recreate MM stack with Traefik labels
3. `curl -sfI https://nmt.lab.clneu.com/` returns 200

**Verify:** Browser URL serves MoneyMatter, not NMT

---

### Task 3: Paycheck-due MCP skill

**Files:**
- Create: `/home/chris/stacks/lab-brain/deploy/hermes/skills/money-due-before-payday/SKILL.md`
- Create: `/home/chris/.cursor/skills/money-due-before-payday/SKILL.md` (copy)

**Verify:** File exists; documents MM MCP tool sequence

---

### Task 4: Daily sync cron + pause moneyvault sync

**Files:**
- Create: `/home/chris/stacks/moneymatter/scripts/mm-bank-sync.sh`
- Update Hermes: disable `simplefin-sync` cron

**Verify:** `hermes cron list` shows simplefin-sync disabled; mm sync script executable

---

### Task 5: Archive NMT + update memory

**Steps:**
1. Tar PocketBase data to `/neuphotos/backups/nmt-pb-YYYY-MM-DD.tar.gz`
2. Update `$CURSOR_MEMORY/moneytracking/CONTEXT.md` and INDEX.md

**Verify:** Backup file exists; memory pushed
