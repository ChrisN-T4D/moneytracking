/**
 * Budget amounts from "Bills Schedule and calculating leftovers - Expenses" PDF.
 * Used to update PocketBase bill amounts via POST /api/update-bills-amounts.
 */

function n(name: string): string {
  return name.toLowerCase().trim().replace(/\s+/g, " ");
}

/** Strip "(Bills Acct)" / "(Checking)" etc. from names for lookup (account is already known from section). */
function normalizeNameForLookup(name: string): string {
  return name
    .replace(/\s*\(bills\s+acct\.?\)\s*$/i, "")
    .replace(/\s*\(bills\s+account\)\s*$/i, "")
    .replace(/\s*\(checking\s+acct\.?\)\s*$/i, "")
    .replace(/\s*\(checking\s+account\)\s*$/i, "")
    .trim();
}

/** Bills collection: key = "account|listType|normalizedName", value = amount */
export const BILLS_AMOUNTS: Record<string, number> = {
  // Bills account - bills
  [n("bills_account|bills|tithing")]: 632.42,
  [n("bills_account|bills|mortgage")]: 1886.96,
  [n("bills_account|bills|oklahoma natural gas")]: 140,
  [n("bills_account|bills|state farm auto insurance")]: 241,
  [n("bills_account|bills|bluepeak (internet)")]: 65,
  [n("bills_account|bills|fast offerings")]: 50,
  [n("bills_account|bills|og & e (electricity)")]: 200,
  [n("bills_account|bills|oklahoma city of enid")]: 100,
  [n("bills_account|bills|life insurance")]: 226.14,
  // Bills account - subscriptions
  [n("bills_account|subscriptions|spotify")]: 10.71,
  [n("bills_account|subscriptions|walmart +")]: 98,
  [n("bills_account|subscriptions|disney + premium")]: 189,
  [n("bills_account|subscriptions|phone bill - mint mobile")]: 600,
  // Checking account - bills
  [n("checking_account|bills|goldman sachs (emergency savings)")]: 100,
  [n("checking_account|bills|rachel demille")]: 30,
  [n("checking_account|bills|goldman sachs (future)")]: 0,
  [n("checking_account|bills|magic spoon")]: 0,
  [n("checking_account|bills|uofutah health bill")]: 100,
  [n("checking_account|bills|dog grooming")]: 200,
  [n("checking_account|bills|chris 401k")]: 0,
  [n("checking_account|bills|401k")]: 0,
  [n("checking_account|bills|harmonee lunch")]: 75,
  [n("checking_account|bills|piano tuition")]: 80,
  // Checking account - subscriptions
  [n("checking_account|subscriptions|netflix (to mom)")]: 9,
  [n("checking_account|subscriptions|audible (checking)")]: 0,
  [n("checking_account|subscriptions|audible- $16.03 (no paypal option) (checking)")]: 0,
  [n("checking_account|subscriptions|car registration (mazda)")]: 150,
  [n("checking_account|subscriptions|car registration (prius)")]: 150,
  [n("checking_account|subscriptions|clip studio paint pro (checking)")]: 24.99,
  [n("checking_account|subscriptions|amazon prime (checking)")]: 139,
  [n("checking_account|subscriptions|costco")]: 120,
};

/** Spanish Fork bills: key = normalized name, value = amount */
export const SPANISH_FORK_AMOUNTS: Record<string, number> = {
  [n("mortgage")]: 2024,
  [n("spanish fork city utilities")]: 150,
  [n("state farm home insurance (escrow)")]: 0,
  [n("hoa charge")]: 220,
  [n("internet + cable")]: 10,
  [n("advantage management")]: 146.25,
  [n("embridge gas (varies)")]: 35,
  [n("embridge gas")]: 35,
};

export function billKey(account: string, listType: string, name: string): string {
  const acc = (account ?? "").toLowerCase().trim();
  const list = (listType ?? "").toLowerCase().trim();
  const normalized = normalizeNameForLookup(name ?? "");
  return `${acc}|${list}|${n(normalized)}`;
}

export function spanishForkKey(name: string): string {
  return n(name);
}

export function lookupBillAmount(account: string, listType: string, name: string): number | undefined {
  const key = billKey(account, listType, name);
  if (BILLS_AMOUNTS[key] !== undefined) return BILLS_AMOUNTS[key];
  const nameOnly = n(name);
  for (const [k, v] of Object.entries(BILLS_AMOUNTS)) {
    if (k.endsWith(`|${nameOnly}`)) return v;
  }
  return undefined;
}

export function lookupSpanishForkAmount(name: string): number | undefined {
  const key = spanishForkKey(name);
  if (SPANISH_FORK_AMOUNTS[key] !== undefined) return SPANISH_FORK_AMOUNTS[key];
  for (const [k, v] of Object.entries(SPANISH_FORK_AMOUNTS)) {
    if (key.includes(k) || k.includes(key)) return v;
  }
  return undefined;
}
