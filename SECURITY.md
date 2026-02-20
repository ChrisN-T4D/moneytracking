# Security and privacy

## Do not commit to GitHub

- **`.env.local`** — Contains your PocketBase URL, **PocketBase admin email/password**, and any other secrets. It is in `.gitignore`; never force-add it.
- **`.env`**, **`.env.development.local`**, **`.env.production.local`** — Same; keep all env files with real values local-only.
- **PocketBase admin credentials** — `POCKETBASE_ADMIN_EMAIL` and `POCKETBASE_ADMIN_PASSWORD` are used by the app on the server only. Set them in Portainer (stack/container environment variables) or in an env file on the server that is never in the repo. See [DEPLOY.md](DEPLOY.md).
- **Real financial data** — Store bills, amounts, and names in PocketBase (or your own backend), not in the repo. The sample data in `lib/data.ts` is generic placeholder only.

## Before pushing

1. Run `git status` and ensure no `.env` or `.env.local` is staged.
2. Ensure no API keys, passwords, or your PocketBase instance URL are in committed files. Use `.env.example` with placeholders only.
3. If you ever committed secrets: rotate them (new PocketBase URL, new keys) and use `git filter-branch` or [BFG](https://rtyley.github.io/bfg-repo-cleaner/) to remove from history, or create a new repo.

## App security

- **PocketBase** — Configure list/create/update/delete rules in the admin so only authorized users can read or change data. Do not allow public list if data is sensitive.
- **NEXT_PUBLIC_*** — Variables prefixed with `NEXT_PUBLIC_` are embedded in the client bundle. Do not put secrets there; use them only for public config (e.g. PocketBase URL).
- **No `dangerouslySetInnerHTML` or `eval`** — The app does not use them; avoid adding user HTML without sanitization.
- **Dependencies** — Run `npm audit` periodically and fix high/critical issues.

## Reporting issues

If you find a security issue, do not open a public GitHub issue. Contact the repo owner privately.
