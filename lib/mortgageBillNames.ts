/**
 * Oklahoma vs Spanish Fork mortgages: align PocketBase names, statement tags, and UI labels.
 * Tags may use "Oklahoma Mortgage" while PB still says "Mortgage"; without aliasing, paid-this-cycle breaks.
 */
import type { ActualBreakdownItem } from "./statementTagging";

export const OKLAHOMA_MORTGAGE_LABEL = "Oklahoma Mortgage";
export const SPANISH_FORK_MORTGAGE_LABEL = "Spanish Fork Mortgage";

const OKLAHOMA_MORTGAGE_PAID_KEYS = new Set([
  "mortgage",
  "oklahoma mortgage",
  "oklahoma mortgage (freedom)",
]);

const SPANISH_FORK_MORTGAGE_PAID_KEYS = new Set(["mortgage", "spanish fork mortgage"]);

export function isOklahomaMortgageBillName(name: string): boolean {
  const l = (name ?? "").toLowerCase().trim();
  if (l === "spanish fork mortgage" || l.startsWith("spanish fork mortgage")) return false;
  if (OKLAHOMA_MORTGAGE_PAID_KEYS.has(l)) return true;
  if (l.startsWith("oklahoma mortgage")) return true;
  return false;
}

export function isSpanishForkMortgageBillName(name: string): boolean {
  const l = (name ?? "").toLowerCase().trim();
  if (l === "spanish fork mortgage" || l.startsWith("spanish fork mortgage")) return true;
  if (l === "mortgage") return true;
  return false;
}

/** Row title on Bills account / Checking bills lists */
export function billsAccountMortgageDisplayName(storedName: string): string {
  if (isOklahomaMortgageBillName(storedName)) return OKLAHOMA_MORTGAGE_LABEL;
  return storedName;
}

/** Row title + paid/breakdown map key for Spanish Fork section */
export function spanishForkMortgageDisplayName(storedName: string): string {
  if (isSpanishForkMortgageBillName(storedName)) return SPANISH_FORK_MORTGAGE_LABEL;
  return storedName;
}

function oklahomaMortgagePaidKeysMatch(billNameLower: string, paidNameLower: string): boolean {
  if (!isOklahomaMortgageBillName(billNameLower)) return false;
  return OKLAHOMA_MORTGAGE_PAID_KEYS.has(paidNameLower);
}

function spanishForkMortgagePaidKeysMatch(billNameLower: string, paidNameLower: string): boolean {
  if (!isSpanishForkMortgageBillName(billNameLower)) return false;
  return SPANISH_FORK_MORTGAGE_PAID_KEYS.has(paidNameLower);
}

/**
 * Aggregate paid totals and breakdown lines for one bill row from tagged statement maps.
 * Keys look like `${section}|${list}|${nameLower}` (e.g. bills_account|bills|oklahoma mortgage).
 */
export function paidAndBreakdownForBillInSection(
  sectionKey: string,
  billNameLower: string,
  paidMap: Map<string, number>,
  breakdownMap: Map<string, ActualBreakdownItem[]>
): { paid: number | undefined; breakdown: ActualBreakdownItem[] | undefined } {
  const prefix = `${sectionKey}|`;
  let paid: number | undefined;
  let breakdown: ActualBreakdownItem[] | undefined;
  const keys = new Set<string>([...paidMap.keys(), ...breakdownMap.keys()]);

  for (const k of keys) {
    if (!k.startsWith(prefix)) continue;
    const paidNameLower = k.slice(prefix.length);
    const exact = paidNameLower === billNameLower;
    const isSf = sectionKey.startsWith("spanish_fork");
    const aliasMatch = isSf
      ? spanishForkMortgagePaidKeysMatch(billNameLower, paidNameLower)
      : oklahomaMortgagePaidKeysMatch(billNameLower, paidNameLower);
    if (!exact && !aliasMatch) continue;

    const amt = paidMap.get(k);
    if (amt !== undefined) paid = (paid ?? 0) + amt;
    const bd = breakdownMap.get(k);
    if (bd?.length) breakdown = [...(breakdown ?? []), ...bd];
  }

  return { paid, breakdown };
}

/** Merge key when building Spanish Fork paid/breakdown maps from raw typed keys (lowercase). */
export function spanishForkPaidMapKey(rawNameLower: string): string {
  if (SPANISH_FORK_MORTGAGE_PAID_KEYS.has(rawNameLower)) return SPANISH_FORK_MORTGAGE_LABEL;
  return rawNameLower;
}

/** Escape a string for use inside PocketBase filter double-quoted values. */
export function escapePbFilterString(s: string): string {
  return s.replace(/\\/g, "\\\\").replace(/"/g, '\\"');
}

/**
 * `bills.name` values to OR together when updating by the canonical Oklahoma row
 * (stored PocketBase name may still be "Mortgage", etc.).
 */
export function oklahomaMortgagePocketBaseNameVariants(requestedName: string): string[] {
  if (!isOklahomaMortgageBillName(requestedName)) {
    return [requestedName.trim()];
  }
  const set = new Set<string>([
    requestedName.trim(),
    OKLAHOMA_MORTGAGE_LABEL,
    "Mortgage",
    "Oklahoma Mortgage (Freedom)",
    "Oklahoma Mortgage (freedom)",
  ]);
  return [...set].filter((x) => x.length > 0);
}

/** PocketBase filter: (name="…" || …) && account="…" && listType="…" */
export function pocketBaseBillsFilterByNamesAndSection(names: string[], account: string, listType: string): string {
  const namePart = names.map((n) => `name="${escapePbFilterString(n)}"`).join(" || ");
  return `(${namePart}) && account="${escapePbFilterString(account)}" && listType="${escapePbFilterString(listType)}"`;
}
