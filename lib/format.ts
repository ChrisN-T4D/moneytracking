export function formatCurrency(value: number): string {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(value);
}

/** Strip "(Bills Acct)" / "(Checking)" etc. from bill names for display (account is shown by section). */
export function displayBillName(name: string): string {
  if (!name || typeof name !== "string") return name;
  return name
    .replace(/\s*\(bills\s+acct\.?\)\s*$/i, "")
    .replace(/\s*\(bills\s+account\)\s*$/i, "")
    .replace(/\s*\(checking\s+acct\.?\)\s*$/i, "")
    .replace(/\s*\(checking\s+account\)\s*$/i, "")
    .replace(/\s*\(checking\)\s*$/i, "")
    .trim() || name;
}

/** Strip "(from Checking)", "(Way2Save)" etc. from auto transfer whatFor for display (account column already shows destination). */
export function displayAutoTransferWhatFor(whatFor: string): string {
  if (!whatFor || typeof whatFor !== "string") return whatFor;
  return whatFor
    .replace(/\s*\(from\s+checking\)\s*$/i, "")
    .replace(/\s*\(to\s+bills\)\s*$/i, "")
    .replace(/\s*\(way2save\)\s*$/i, "")
    .replace(/\s*\(checking\)\s*$/i, "")
    .trim() || whatFor;
}
