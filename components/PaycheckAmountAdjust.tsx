"use client";

import { useState, useEffect, type MouseEvent } from "react";
import { createPortal } from "react-dom";
import { formatCurrency, displayBillName } from "@/lib/format";
import { savePaycheckAmountOverride } from "@/lib/billsApiClient";
import { getCardClasses } from "@/lib/themePalettes";
import { useTheme } from "./ThemeProvider";

export type PaycheckAmountAdjustProps = {
  name: string;
  account: string;
  amount: number;
  defaultAmount: number;
  hasOverride?: boolean;
  nextPaydayYmd: string;
  onSaved: (saved: { amount: number; defaultAmount: number; cleared: boolean }) => void;
  billIds?: string[];
  collection?: "bills" | "spanish_fork_bills";
  /** inline = upcoming/check-in row; breakdown = needed-before-paycheck list */
  variant?: "inline" | "breakdown";
};

export function PaycheckAmountAdjust({
  name,
  account,
  amount,
  defaultAmount,
  hasOverride = false,
  nextPaydayYmd,
  onSaved,
  billIds,
  collection,
  variant = "inline",
}: PaycheckAmountAdjustProps) {
  const { theme } = useTheme();
  const [open, setOpen] = useState(false);
  const [value, setValue] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [mounted, setMounted] = useState(false);

  useEffect(() => setMounted(true), []);

  const openDialog = (e: MouseEvent) => {
    e.stopPropagation();
    e.preventDefault();
    setValue(String(amount));
    setError(null);
    setOpen(true);
  };

  const closeDialog = () => {
    if (saving) return;
    setOpen(false);
    setError(null);
  };

  const save = async () => {
    const n = parseFloat(value.replace(/,/g, ""));
    if (Number.isNaN(n) || n < 0) {
      setError("Enter a valid amount");
      return;
    }
    setSaving(true);
    setError(null);
    const result = await savePaycheckAmountOverride({
      name,
      account,
      nextPaydayYmd,
      amount: n,
      billIds,
      collection,
    });
    setSaving(false);
    if (!result.ok) {
      setError(result.message ?? "Save failed");
      return;
    }
    setOpen(false);
    onSaved({ amount: n, defaultAmount, cleared: false });
  };

  const reset = async () => {
    setSaving(true);
    setError(null);
    const result = await savePaycheckAmountOverride({
      name,
      account,
      nextPaydayYmd,
      amount: null,
      billIds,
      collection,
    });
    setSaving(false);
    if (!result.ok) {
      setError(result.message ?? "Reset failed");
      return;
    }
    setOpen(false);
    onSaved({ amount: defaultAmount, defaultAmount, cleared: true });
  };

  const trigger =
    variant === "inline" ? (
      <div className="flex items-center gap-1 shrink-0">
        <button
          type="button"
          title="Change amount for this paycheck only"
          disabled={saving}
          onClick={openDialog}
          className="rounded border border-amber-400/60 dark:border-amber-600/50 bg-amber-50/80 dark:bg-amber-900/20 px-1.5 py-0.5 text-[10px] font-medium text-amber-800 dark:text-amber-300 hover:bg-amber-100 dark:hover:bg-amber-900/40 whitespace-nowrap min-h-[28px]"
        >
          Adjust
        </button>
        <span
          className={`tabular-nums font-medium ${hasOverride ? "text-amber-600 dark:text-amber-400" : "text-red-600 dark:text-red-400"}`}
        >
          {formatCurrency(amount)}
        </span>
      </div>
    ) : (
      <div className="flex items-center gap-1.5 shrink-0">
        {hasOverride && (
          <span className="text-[10px] text-amber-600 dark:text-amber-400">custom</span>
        )}
        <button
          type="button"
          onClick={openDialog}
          title="Adjust amount for this paycheck only"
          className={`tabular-nums hover:underline text-xs ${hasOverride ? "text-amber-600 dark:text-amber-400 font-medium" : "text-neutral-700 dark:text-neutral-300"}`}
        >
          {formatCurrency(amount)}
        </button>
        <button
          type="button"
          onClick={openDialog}
          className="rounded border border-amber-400/60 px-1.5 py-0.5 text-[10px] font-medium text-amber-800 dark:text-amber-300"
        >
          Adjust
        </button>
      </div>
    );

  const dialog =
    open && mounted
      ? createPortal(
          <div
            className="fixed inset-0 z-[200] flex items-center justify-center p-4 bg-black/50"
            role="dialog"
            aria-modal="true"
            aria-labelledby="paycheck-adjust-title"
            onClick={closeDialog}
          >
            <div
              className={getCardClasses(theme.summary) + " w-full max-w-sm shadow-xl p-4 space-y-3"}
              onClick={(e) => e.stopPropagation()}
            >
              <h3 id="paycheck-adjust-title" className="text-sm font-semibold text-neutral-900 dark:text-neutral-100">
                Adjust for this paycheck
              </h3>
              <p className="text-xs text-neutral-600 dark:text-neutral-400">
                {displayBillName(name)} — only applies until {nextPaydayYmd}. Default recurring amount stays{" "}
                {formatCurrency(defaultAmount)}.
              </p>
              <div>
                <label className="text-xs text-neutral-500 dark:text-neutral-400 block mb-1">Amount this paycheck</label>
                <input
                  type="text"
                  inputMode="decimal"
                  value={value}
                  onChange={(ev) => setValue(ev.target.value)}
                  className="w-full rounded-lg border border-neutral-300 dark:border-neutral-600 bg-white dark:bg-neutral-900 px-3 py-2 text-sm tabular-nums text-neutral-900 dark:text-neutral-100"
                  autoFocus
                  disabled={saving}
                  onKeyDown={(ev) => {
                    if (ev.key === "Enter") void save();
                    if (ev.key === "Escape") closeDialog();
                  }}
                />
              </div>
              {error && <p className="text-xs text-red-600 dark:text-red-400">{error}</p>}
              <div className="flex flex-wrap gap-2 justify-end pt-1">
                {hasOverride && (
                  <button
                    type="button"
                    disabled={saving}
                    onClick={() => void reset()}
                    className="mr-auto text-xs text-neutral-500 hover:text-neutral-700 dark:hover:text-neutral-300"
                  >
                    Reset to default
                  </button>
                )}
                <button
                  type="button"
                  disabled={saving}
                  onClick={closeDialog}
                  className="rounded-lg border border-neutral-300 dark:border-neutral-600 px-3 py-1.5 text-xs font-medium"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  disabled={saving}
                  onClick={() => void save()}
                  className="rounded-lg bg-sky-600 text-white px-3 py-1.5 text-xs font-medium disabled:opacity-50"
                >
                  {saving ? "Saving…" : "Save"}
                </button>
              </div>
            </div>
          </div>,
          document.body
        )
      : null;

  return (
    <>
      {trigger}
      {dialog}
    </>
  );
}
