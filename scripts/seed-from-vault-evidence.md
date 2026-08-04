# Vault → NMT seed evidence
Generated 2026-08-04 from `~/moneyvault` on neu1. Statement YAML beats averages; ledger confirms.

## Paychecks

| Name | Amount | Frequency | Anchor | Source |
|------|--------|-----------|--------|--------|
| Quest Diagnostics | 1490.79 | biweekly | 2026-07-31 | Ledger median of 9 full deposits Apr–Jul 2026 (≥$1000). Last deposit 2026-07-31. |
| NWOSU | 3403.34 | monthlyLastWorkingDay | — | Ledger modal: 6 of 8 deposits exactly 3403.34. Exclude Jun bonus 5485.23 and Jul short 2152.29. |

Prior “~$1616 / ~$3105” figures are **stale** vs current ledger — not used.

## Bills — Oklahoma (`bills_account`)

| Name | Amount | Freq | Source | Notes |
|------|--------|------|--------|-------|
| Oklahoma Mortgage | 1886.96 | monthly | debts.yml monthly_payment; ledger Apr–Jul each 1886.96 | Single line (do not split Rocket fragments) |
| State Farm Auto Insurance | 270.58 | monthly | Ledger Jun+Jul both 270.58 | Prefer latest rate over older 241 |
| Life Insurance | 226.14 | monthly | Ledger 7× identical; Northwestern Mutual | |
| OG & E (Electricity) | 195.41 | monthly | Ledger median of last 6 | Varies (Jul 350.03) |
| Oklahoma Natural Gas | 115.69 | monthly | Ledger median of last 6 | Seasonal (summer ~65) |
| Oklahoma City of Enid | 174.05 | monthly | Ledger median of last 6 | Varies |
| BluePeak (Internet) | 67.94 | monthly | Ledger Mar–Jul all 67.94 | |
| Toyota Car Payment | 137.13 | monthly | debts.yml; ledger May–Jul 137.13 from **wf_oklahoma** | On bills account |

## Bills — Checking (`checking_account`)

| Name | Amount | Freq | Source |
|------|--------|------|--------|
| Jeff Neu (family loan) | 100.00 | monthly | debts.yml; ledger regular $100 |
| Kerrie Neu (family loan) | 100.00 | monthly | debts.yml; ledger regular $100 |
| Mark Murphy (family loan) | 50.00 | 2weeks | debts.yml ($50 biweekly); ledger 7× $50 |
| Goldman Sachs (Emergency Savings) | 100.00 | 2weeks | Ledger 15× $100 biweekly Marcus drip |

## Spanish Fork

| Name | Amount | Freq | tenantPaid | Source |
|------|--------|------|------------|--------|
| Spanish Fork Mortgage | 2015.54 | monthly | false | debts.yml; ledger Feb–Jul each 2015.54 |
| HOA Charge | 220.00 | monthly | false | properties.yml hoa_monthly; ledger 7× 220 |
| Spanish Fork City (internet/small) | 10.00 | monthly | true | Ledger May–Jul $10 (large city util ended after tenant) |
| Spotify | 13.96 | monthly | false | Ledger Mar–Aug 13.96 from wf_spanish_fork |

## Summary

| Field | Value | Source |
|-------|-------|--------|
| spanishForkTenantRentMonthly | 1678.95 | properties.yml net_rent_typical |
| checking/bills/SF balances | omitted | Enter in UI |

## Auto transfers (stable recurring in ledger)

| whatFor | Amount | Freq | Account label |
|---------|--------|------|---------------|
| Oklahoma Bill Covering | 3400 | Monthly | Oklahoma Bills |
| Oklahoma Bill Remaining | 80 | 2 Weeks | Oklahoma Bills |
| Spanish Fork Bill Covering | 300 | 2 Weeks | Spanish Fork Bills |
| Subscription Covering | 35 | 2 Weeks | Spanish Fork Bills |
| Fun Money (Chris) | 100 | 2 Weeks | Chris Account |
| Fun Money (Melodee) | 100 | 2 Weeks | Melodee Account |
| Pay Family (Jeff/Kerrie) | 100 | 2 Weeks | Spanish Fork Bills |

## Omitted (accuracy)

| Item | Why |
|------|-----|
| Tithing fixed bill | Monthly totals 236–2639; no stable statement amount |
| Fast Offerings | No ledger matches |
| Dominion Energy | Stopped after Mar 2026; tenant pays utilities |
| Advantage Management fee line | Netted from rent deposit; not a separate owner ACH |
| PDF discretionary bills (dog, piano, etc.) | Not vault fixed obligations |
| Current account balances | Stale / unknown |

## Spot-check targets after seed

- Rocket 1886.96, Freedom 2015.54, Toyota 137.13, HOA 220
- Quest 1490.79, NWOSU 3403.34
- Family loans 100/100/50, Marcus 100
- State Farm 270.58, Life 226.14, BluePeak 67.94
