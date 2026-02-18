"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";

interface SuggestedPaycheck {
  name: string;
  frequency: string;
  anchorDate: string;
  amount: number;
  count: number;
  lastDate: string;
}

interface AddPaychecksFromStatementsModalProps {
  /** Controlled: when provided with onClose, modal visibility is controlled by parent (no trigger button). */
  open?: boolean;
  onClose?: () => void;
}

export function AddPaychecksFromStatementsModal({ open: controlledOpen, onClose }: AddPaychecksFromStatementsModalProps = {}) {
  const router = useRouter();
  const [internalOpen, setInternalOpen] = useState(false);
  const isControlled = controlledOpen !== undefined && onClose !== undefined;
  const open = isControlled ? controlledOpen : internalOpen;
  const [fillStatus, setFillStatus] = useState<"idle" | "loading" | "success" | "error">("idle");
  const [fillMessage, setFillMessage] = useState("");
  const [suggestedPaychecks, setSuggestedPaychecks] = useState<SuggestedPaycheck[]>([]);
  const [selectedPaycheckIndices, setSelectedPaycheckIndices] = useState<Set<number>>(new Set());
  const [paycheckFrequencyByIndex, setPaycheckFrequencyByIndex] = useState<Record<number, string>>({});
  const [applying, setApplying] = useState(false);

  async function handleAnalyze() {
    setFillStatus("loading");
    setFillMessage("");
    try {
      const res = await fetch("/api/fill-from-statements");
      const data = (await res.json()) as Record<string, unknown>;
      if (!res.ok) {
        setFillStatus("error");
        setFillMessage((data.message as string) ?? "Analyze failed.");
        return;
      }
      const pcs = (data.paychecks as SuggestedPaycheck[]) ?? [];
      setSuggestedPaychecks(pcs);
      setSelectedPaycheckIndices(new Set(pcs.map((_, i) => i)));
      const freqByIndex: Record<number, string> = {};
      pcs.forEach((p, i) => {
        const f = p.frequency === "monthlyLastWorkingDay" || p.frequency === "monthly" ? p.frequency : "biweekly";
        freqByIndex[i] = f;
      });
      setPaycheckFrequencyByIndex(freqByIndex);
      setFillStatus("success");
      const n = data.statementsCount ?? 0;
      setFillMessage(pcs.length === 0
        ? `No paychecks found in ${n} statements. Import statements on the Statements page first.`
        : `Found ${pcs.length} paychecks from ${n} statements. Select which to add.`);
    } catch (err) {
      setFillStatus("error");
      setFillMessage(err instanceof Error ? err.message : "Analyze failed.");
    }
  }

  function togglePaycheck(i: number) {
    setSelectedPaycheckIndices((prev) => {
      const next = new Set(prev);
      if (next.has(i)) next.delete(i);
      else next.add(i);
      return next;
    });
  }

  async function handleApplyPaychecks() {
    const selected = suggestedPaychecks
      .map((p, i) =>
        selectedPaycheckIndices.has(i)
          ? ({ ...p, frequency: paycheckFrequencyByIndex[i] ?? p.frequency } as const)
          : null
      )
      .filter((x): x is NonNullable<typeof x> => x !== null);
    if (selected.length === 0) {
      setFillMessage("Select at least one paycheck to add.");
      return;
    }
    setApplying(true);
    try {
      const res = await fetch("/api/fill-from-statements", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ createPaychecks: true, paychecks: selected }),
      });
      const data = (await res.json()) as Record<string, unknown>;
      if (res.ok) {
        setFillMessage((data.message as string) ?? `Created ${data.paychecksCreated ?? 0} paychecks.`);
        setSuggestedPaychecks([]);
        setSelectedPaycheckIndices(new Set());
        router.refresh();
      } else {
        setFillMessage((data.message as string) ?? "Create failed.");
      }
    } catch (err) {
      setFillMessage(err instanceof Error ? err.message : "Create failed.");
    } finally {
      setApplying(false);
    }
  }

  useEffect(() => {
    if (open && suggestedPaychecks.length === 0 && fillStatus !== "loading") void handleAnalyze();
  }, [open]);

  const openModal = () => {
    if (isControlled) {
      onClose?.(); // parent will set open to true
    } else {
      setInternalOpen(true);
    }
    if (suggestedPaychecks.length === 0 && fillStatus !== "loading") void handleAnalyze();
  };

  const closeModal = () => {
    if (isControlled) onClose?.();
    else setInternalOpen(false);
  };

  return (
    <>
      {!isControlled && (
        <button
          type="button"
          onClick={openModal}
          className="w-full rounded-full bg-emerald-600 text-white px-3 py-1.5 text-sm font-medium shadow-sm hover:bg-emerald-500"
        >
          Add paychecks from statements
        </button>
      )}

      {open && (
        <div
          className="fixed inset-0 z-50 flex min-h-screen items-center justify-center bg-neutral-950/60 px-4 backdrop-blur-sm"
          onClick={closeModal}
        >
          <div
            className="bg-gradient-to-b from-emerald-50/60 via-white to-white dark:from-neutral-900 dark:via-neutral-950 dark:to-neutral-950 rounded-2xl shadow-2xl max-w-3xl w-[95vw] max-h-[80vh] flex flex-col border border-neutral-200/70 dark:border-neutral-800"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between border-b border-neutral-200/70 dark:border-neutral-800/80 px-4 py-3 bg-white/70 dark:bg-neutral-900/60 backdrop-blur-sm rounded-t-2xl">
              <h2 className="text-sm font-semibold tracking-wide text-neutral-900 dark:text-neutral-50">
                Add paychecks from statements
              </h2>
              <button
                type="button"
                onClick={closeModal}
                className="rounded-lg p-1.5 text-neutral-500 hover:text-neutral-700 dark:hover:text-neutral-300 hover:bg-neutral-100 dark:hover:bg-neutral-800"
                aria-label="Close"
              >
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>

            <div className="flex-1 overflow-y-auto px-4 py-4 space-y-4">
              <p className="text-xs text-neutral-500 dark:text-neutral-400">
                Use imported statements to suggest expected paychecks (e.g. Gusto Payroll, Direct Deposit). Select which to add and set frequency.
              </p>
              <button
                type="button"
                onClick={handleAnalyze}
                disabled={fillStatus === "loading"}
                className="w-full rounded-lg bg-neutral-700 dark:bg-neutral-300 text-white dark:text-neutral-900 px-4 py-2.5 text-sm font-medium hover:bg-neutral-600 dark:hover:bg-neutral-200 disabled:opacity-50"
              >
                {fillStatus === "loading" ? "Analyzing…" : "Analyze statements"}
              </button>
              {(fillStatus === "success" || fillStatus === "error") && fillMessage && (
                <p
                  className={`text-xs ${
                    fillStatus === "error"
                      ? "text-red-600 dark:text-red-400"
                      : "text-neutral-600 dark:text-neutral-300"
                  }`}
                >
                  {fillMessage}
                </p>
              )}
              {suggestedPaychecks.length > 0 && (
                <div>
                  <p className="text-xs font-medium text-neutral-700 dark:text-neutral-300 mb-2">
                    Suggested paychecks (select which to add; set frequency)
                  </p>
                  <ul className="space-y-2 text-xs text-neutral-600 dark:text-neutral-400">
                    {suggestedPaychecks.map((p, i) => (
                      <li key={i} className="flex flex-wrap items-center gap-2">
                        <input
                          type="checkbox"
                          checked={selectedPaycheckIndices.has(i)}
                          onChange={() => togglePaycheck(i)}
                          className="mt-0.5 rounded border-neutral-400"
                        />
                        <span className="min-w-0">
                          {p.name} — ${p.amount.toFixed(2)} ({p.count}× in statements, last {p.lastDate})
                        </span>
                        <label className="sr-only" htmlFor={`paycheck-freq-modal-${i}`}>
                          Frequency
                        </label>
                        <select
                          id={`paycheck-freq-modal-${i}`}
                          value={paycheckFrequencyByIndex[i] ?? (p.frequency === "monthlyLastWorkingDay" || p.frequency === "monthly" ? p.frequency : "biweekly")}
                          onChange={(e) => setPaycheckFrequencyByIndex((prev) => ({ ...prev, [i]: e.target.value }))}
                          className="rounded border border-neutral-400 bg-white dark:bg-neutral-800 px-2 py-0.5"
                        >
                          <option value="biweekly">Biweekly</option>
                          <option value="monthly">Monthly</option>
                          <option value="monthlyLastWorkingDay">Monthly (last working day)</option>
                        </select>
                      </li>
                    ))}
                  </ul>
                  <button
                    type="button"
                    onClick={handleApplyPaychecks}
                    disabled={applying}
                    className="mt-2 rounded-lg bg-emerald-600 text-white px-3 py-1.5 text-sm font-medium hover:bg-emerald-500 disabled:opacity-50"
                  >
                    {applying ? "Adding…" : `Add ${selectedPaycheckIndices.size} selected paychecks to main page`}
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </>
  );
}
