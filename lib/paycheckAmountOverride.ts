/** Per-paycheck amount override (stored on bill rows in PocketBase). */

export type PaycheckAmountOverrideFields = {
  amount: number;
  paycheckAmountOverride?: number | null;
  paycheckAmountOverrideFor?: string | null;
};

/** Cycle key for "this paycheck round" — tied to next payday date. */
export function paycheckAmountOverrideKey(nextPaydayYmd: string): string {
  return `p:${nextPaydayYmd.trim().slice(0, 10)}`;
}

/** Effective amount for paycheck-needed math; uses override only when keyed to this payday. */
export function effectivePaycheckAmount(
  bill: PaycheckAmountOverrideFields,
  nextPaydayYmd: string | null | undefined
): number {
  const base = Number(bill.amount) || 0;
  if (!nextPaydayYmd) return base;
  const key = paycheckAmountOverrideKey(nextPaydayYmd);
  const forKey = (bill.paycheckAmountOverrideFor ?? "").trim();
  if (forKey !== key) return base;
  const override = bill.paycheckAmountOverride;
  if (override === null || override === undefined) return base;
  const n = Number(override);
  if (Number.isNaN(n) || n < 0) return base;
  return n;
}

export function hasActivePaycheckAmountOverride(
  bill: PaycheckAmountOverrideFields,
  nextPaydayYmd: string | null | undefined
): boolean {
  if (!nextPaydayYmd) return false;
  const key = paycheckAmountOverrideKey(nextPaydayYmd);
  if ((bill.paycheckAmountOverrideFor ?? "").trim() !== key) return false;
  const override = bill.paycheckAmountOverride;
  if (override === null || override === undefined) return false;
  const n = Number(override);
  return !Number.isNaN(n) && n >= 0;
}
