# PocketBase setup for Neu Money Tracking

Set `NEXT_PUBLIC_POCKETBASE_URL` in `.env.local` (e.g. `https://your-instance.pockethost.io`). The app uses the **REST API** (no SDK), so enable **list** (read) for each collection if you want public read access, or use API rules as needed.

## Create collections and seed from the app (no manual PocketBase setup)

You can create all collections and seed them with default data **from the website** so you don’t have to add anything in the PocketBase admin.

1. In `.env.local` set:
   - `NEXT_PUBLIC_POCKETBASE_URL` (your PocketBase URL, e.g. `https://pbyour-domain.com/_/`)
   - `POCKETBASE_ADMIN_EMAIL` and `POCKETBASE_ADMIN_PASSWORD` (PocketBase admin login)
   - Optionally `POCKETBASE_API_URL` — if you get **404** on setup, your API may be at the root (e.g. `https://pbyour-domain.com`); set this to that URL and leave `NEXT_PUBLIC_POCKETBASE_URL` as-is for the app
   - Optionally `SEED_SECRET` — if set, you must enter this key on the setup page
2. Restart the dev server, then open **http://localhost:3001/setup**.
3. Enter the setup key (if you set `SEED_SECRET`) and click **Create collections and seed data**.
4. The app will create the 6 collections (sections, bills, auto_transfers, spanish_fork_bills, summary, paychecks) and fill them with the default data from `lib/data.ts`.

You can run it again with **Seed only** checked to re-seed records (e.g. after changing default data); collections won’t be re-created.

### If your host blocks the admin API (404 on setup)

**“Seed data without admin” only adds records.** It does **not** create collections or add fields. You must create every collection and every field yourself in PocketBase first.

Some hosted PocketBase instances disable the admin API. If setup fails with “Admin auth failed: 404”:

1. **Create each collection and every field manually** in PocketBase admin: go to **Collections** → **New collection** for each of **sections**, **bills**, **auto_transfers**, **spanish_fork_bills**, **summary**, **paychecks**, **statements**. For each collection, add **all** the fields listed in **Collections (reference)** below (name, type, required as shown). Field names and types must match exactly.
2. For each collection, open **API rules** and set **Create** so that record creation is allowed (e.g. leave empty or set a rule that allows it, depending on your host).
3. On **http://localhost:3001/setup**, click **Seed data without admin**. The app will POST records to the public API (no admin token). No admin email/password needed.
4. After seeding, you can tighten the Create rule again if you want (e.g. allow only admins).

---

## Collections (reference)

If you prefer to create collections manually in PocketBase admin, use the schema below. All text fields are type **Plain text** unless noted.

---

### 1. `sections`

Defines which sections appear on the page and in what order.

| Field      | Type    | Required | Notes |
|-----------|---------|----------|--------|
| sortOrder | Number  | yes      | Order on page (e.g. 0, 1, 2…) |
| type      | Plain text | yes  | One of: `bills_list`, `spanish_fork`, `auto_transfers` |
| title     | Plain text | yes  | Section heading |
| subtitle  | Plain text | no   | Optional subheading |
| account   | Plain text | no   | For `type=bills_list` only: `bills_account` or `checking_account` |
| listType  | Plain text | no   | For `type=bills_list` only: `bills` or `subscriptions` |

**Example records** (match current app order):

| sortOrder | type         | title                          | subtitle          | account        | listType      |
|-----------|--------------|---------------------------------|-------------------|----------------|---------------|
| 0         | bills_list   | Bills (Bills Account)          | Oklahoma bills    | bills_account  | bills         |
| 1         | bills_list   | Subscriptions (Bills Account)  |                   | bills_account  | subscriptions |
| 2         | bills_list   | Bills (Checking Account)       | Checking bills    | checking_account | bills       |
| 3         | bills_list   | Subscriptions (Checking Account)|                  | checking_account | subscriptions |
| 4         | spanish_fork | Spanish Fork (Rental)           | Bills with tenant paid amounts | | |
| 5         | auto_transfers | Auto transfers               | What for, frequency, account, date, amount | | |

---

### 2. `bills`

Bills and subscriptions for the bills-list sections. Each record has `account` + `listType` so the app can filter by section.

| Field            | Type    | Required | Notes |
|------------------|---------|----------|--------|
| name             | Plain text | yes   | Bill/sub name |
| frequency        | Plain text | yes   | One of: `2weeks`, `monthly`, `yearly` |
| nextDue          | Plain text | yes   | e.g. "Feb 28, 2026" |
| inThisPaycheck   | Bool    | yes      | In current paycheck period? |
| amount           | Number  | yes      | Dollar amount |
| autoTransferNote | Plain text | no   | Optional note (e.g. "Covered by monthly income transfer") |
| account          | Plain text | yes   | `bills_account` or `checking_account` |
| listType         | Plain text | yes   | `bills` or `subscriptions` |

---

### 3. `auto_transfers`

Auto-transfer rows (what for, frequency, account, date, amount).

| Field     | Type       | Required | Notes |
|-----------|------------|----------|--------|
| whatFor   | Plain text | yes      | Description |
| frequency | Plain text | yes      | e.g. "Monthly", "2 Weeks" |
| account   | Plain text | yes      | e.g. "Oklahoma Bills", "Account A" |
| date      | Plain text | yes      | e.g. "2/2/2026" |
| amount    | Number     | yes      | Dollar amount |

---

### 4. `spanish_fork_bills`

Spanish Fork rental bills (with optional tenant-paid amount).

| Field          | Type       | Required | Notes |
|----------------|------------|----------|--------|
| name           | Plain text | yes      | Bill name |
| frequency      | Plain text | yes      | e.g. "Monthly" |
| nextDue        | Plain text | yes      | e.g. "Mar 6, 2026" |
| inThisPaycheck | Bool       | yes      | In current paycheck? |
| amount         | Number     | yes      | Dollar amount |
| tenantPaid     | Number     | no       | Amount tenant paid; leave empty for "—" |

---

### 5. `summary`

Single “summary” view (amounts needed, leftover, plan). Use **one** record (or the first record is used).

| Field                 | Type       | Required | Notes |
|-----------------------|------------|----------|--------|
| monthlyTotal          | Number     | no       | |
| totalNeeded           | Number     | no       | |
| billsAccountNeeded    | Number     | no       | |
| checkingAccountNeeded | Number     | no       | |
| spanishForkNeeded     | Number     | no       | |
| billsSubscriptions    | Number     | no       | |
| checkingSubscriptions | Number     | no       | |
| leftOver              | Number     | no       | |
| leftOverPerPaycheck   | Number     | no       | |
| planToFamily          | Plain text | no       | e.g. "100 per paycheck" |

---

### 6. `paychecks` (existing)

If you already use this for paychecks, keep it. Fields: `name`, `frequency` (`biweekly` | `monthly` | `monthlyLastWorkingDay`), `anchorDate`, `dayOfMonth`, `amount`.

---

### 7. `statements` (CSV uploads)

One record per transaction row from an uploaded statement CSV. Used by **http://localhost:3001/statements** when you upload CSVs.

| Field       | Type       | Required | Notes |
|------------|------------|----------|--------|
| date       | Plain text | yes      | Transaction date (e.g. "2026-02-15") |
| description| Plain text | yes      | Payee / memo |
| amount     | Number     | yes      | Positive = credit, negative = debit |
| balance    | Number     | no       | Running balance after transaction |
| category   | Plain text | no       | Category label |
| account    | Plain text | no       | Which account (e.g. "Checking") |
| sourceFile | Plain text | no       | Original CSV filename |

Set **Create** rule so the app can POST new records when importing (e.g. allow create). **List** rule for read if you want to show statements in the app.

---

## Self-hosting: reverse proxy and admin API

If you self-host PocketBase behind nginx, Caddy, or another reverse proxy, the app needs **both**:

- **GET** `/api/health` and **GET** `/api/collections/*` (for reading data)
- **POST** `/api/admins/auth-with-password` and **POST** `/api/collections` (for setup: create collections and seed)

A 404 on admin auth usually means the proxy is not forwarding `/api/admins/*` to PocketBase. Fix it by proxying **all** of `/api/` to your PocketBase backend, not just some paths.

**Example (nginx):** proxy the whole API path to PocketBase:

```nginx
location /api/ {
    proxy_pass http://127.0.0.1:8090/api/;   # or your PocketBase address
    proxy_http_version 1.1;
    proxy_set_header Host $host;
    proxy_set_header X-Real-IP $remote_addr;
    proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    proxy_set_header X-Forwarded-Proto $scheme;
}
```

**Check:** Open **http://localhost:3001/api/pocketbase-probe** and look at `adminAuth`. If `status` is **400**, the admin API is reachable (400 = bad request for empty credentials). If `status` is **404**, the proxy is not forwarding `/api/admins/*`.

---

## Behavior

- If `NEXT_PUBLIC_POCKETBASE_URL` is **not** set, the app uses **static data** from `lib/data.ts` (no PocketBase).
- If the URL **is** set:
  - **Sections**: If the `sections` collection has at least one record, the page is built from PocketBase (sections + bills, auto_transfers, spanish_fork_bills, summary).
  - **Summary**: If a `summary` record exists, it is used; otherwise the app falls back to `initialSummary`.
- Data is revalidated every 60 seconds (`revalidate: 60`).
