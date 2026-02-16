# Neu Money Tracking

Household money tracker — bills, paychecks, and leftovers. Mobile-friendly, manual input first; PocketBase for data and auth.

## Stack

- **Next.js 15** (App Router, TypeScript, Tailwind)
- **PocketBase** (when ready) — auth + collections

## Run locally

```bash
npm install
npm run dev
```

Open [http://localhost:3001](http://localhost:3001) (port 3001 to avoid conflict with other apps).

## PocketBase

Set `NEXT_PUBLIC_POCKETBASE_URL` in `.env.local` to your PocketBase instance URL. **Do not commit `.env.local`** (see [SECURITY.md](SECURITY.md)).

### Paychecks collection (for next-paycheck automation)

In your PocketBase admin, create a collection **paychecks** with:

| Field       | Type   | Notes |
|------------|--------|--------|
| `name`     | Text   | Display name (e.g. "Partner A") |
| `frequency`| Select | `biweekly`, `monthly`, or `monthlyLastWorkingDay` |
| `anchorDate` | Date | For biweekly: any **Thursday** in the pay series |
| `dayOfMonth` | Number | For monthly (fixed day) only: 1–31. Not used for monthlyLastWorkingDay. |
| `amount`   | Number | Optional; shown in the Next paychecks card |

- **biweekly** = every other Thursday (anchor must be a Thursday).
- **monthlyLastWorkingDay** = last weekday (Mon–Fri) of each month.
- **List** rule: allow so the app can read records.
- If the collection is empty, the app uses generic placeholder defaults.

## Build

```bash
npm run build
npm start
```
