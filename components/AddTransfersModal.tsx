"use client";

import { useState, useEffect, useCallback } from "react";
import { createPortal } from "react-dom";
import { formatCurrency } from "@/lib/format";
import { getCardClasses } from "@/lib/themePalettes";
import { useTheme } from "./ThemeProvider";

interface TransferStatement {
  id: string;
  date: string;
  description: string;
  amount: number;
  account?: string | null;
  pairedStatementId?: string | null;
  goalId?: string | null;
}

interface Goal {
  id: string;
  name: string;
}

type PairDraft = {
  outId: string;
  inId: string;
  fromAccount: string;
  toAccount: string;
  goalId: string | null;
};

const ACCOUNT_OPTIONS = [
  { value: "checking_account", label: "Joint Checking" },
  { value: "bills_account", label: "Oklahoma Bills" },
  { value: "spanish_fork", label: "Spanish Fork" },
  { value: "savings", label: "Savings" },
  { value: "other", label: "Other" },
];

export function AddTransfersModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { theme } = useTheme();
  const [items, setItems] = useState<TransferStatement[]>([]);
  const [goals, setGoals] = useState<Goal[]>([]);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");
  const [pairs, setPairs] = useState<PairDraft[]>([]);
  const [selectingPairFor, setSelectingPairFor] = useState<string | null>(null);

  const fetchTransfers = useCallback(async () => {
    setLoading(true);
    setMessage("");
    try {
      const res = await fetch("/api/statement-tags?transfersOnly=true");
      const data = (await res.json()) as { ok?: boolean; items?: TransferStatement[]; goals?: Goal[]; message?: string };
      if (!res.ok || data.ok === false) {
        setMessage(data.message ?? "Failed to load transfers.");
        return;
      }
      const transfers = data.items ?? [];
      setItems(transfers);
      setGoals(data.goals ?? []);

      // Reconstruct existing pairs from pairedStatementId
      const existingPairs: PairDraft[] = [];
      const seen = new Set<string>();
      for (const t of transfers) {
        if (t.pairedStatementId && !seen.has(t.id)) {
          const other = transfers.find((o) => o.id === t.pairedStatementId);
          if (other) {
            seen.add(t.id);
            seen.add(other.id);
            const out = t.amount < 0 ? t : other;
            const inp = t.amount >= 0 ? t : other;
            existingPairs.push({
              outId: out.id,
              inId: inp.id,
              fromAccount: inferAccount(out) ?? "checking_account",
              toAccount: inferAccount(inp) ?? "bills_account",
              goalId: out.goalId ?? inp.goalId ?? null,
            });
          }
        }
      }
      setPairs(existingPairs);
    } catch (err) {
      setMessage(err instanceof Error ? err.message : "Failed to load.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (open) void fetchTransfers();
  }, [open, fetchTransfers]);

  if (!open || typeof document === "undefined") return null;

  function inferAccount(s: TransferStatement): string | null {
    const acct = (s.account ?? "").toLowerCase();
    if (acct.includes("bills")) return "bills_account";
    if (acct.includes("spanish")) return "spanish_fork";
    if (acct.includes("checking") || acct.includes("joint")) return "checking_account";
    if (acct.includes("saving") || acct.includes("goldman")) return "savings";
    return null;
  }

  const pairedIds = new Set<string>();
  for (const p of pairs) { pairedIds.add(p.outId); pairedIds.add(p.inId); }
  const unpaired = items.filter((i) => !pairedIds.has(i.id));
  const outflows = unpaired.filter((i) => i.amount < 0);
  const inflows = unpaired.filter((i) => i.amount >= 0);

  function createPair(outId: string, inId: string) {
    const out = items.find((i) => i.id === outId);
    const inp = items.find((i) => i.id === inId);
    if (!out || !inp) return;
    setPairs((prev) => [...prev, {
      outId,
      inId,
      fromAccount: inferAccount(out) ?? "checking_account",
      toAccount: inferAccount(inp) ?? "bills_account",
      goalId: null,
    }]);
    setSelectingPairFor(null);
  }

  function removePair(outId: string) {
    setPairs((prev) => prev.filter((p) => p.outId !== outId));
  }

  function updatePair(outId: string, updates: Partial<PairDraft>) {
    setPairs((prev) => prev.map((p) => p.outId === outId ? { ...p, ...updates } : p));
  }

  async function savePairs() {
    setSaving(true);
    setMessage("");
    try {
      const pairsPayload = pairs.map((p) => ({
        outStatementId: p.outId,
        inStatementId: p.inId,
        fromAccount: p.fromAccount,
        toAccount: p.toAccount,
        goalId: p.goalId,
      }));
      const res = await fetch("/api/transfer-pairs", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ pairs: pairsPayload }),
      });
      const data = (await res.json()) as { ok?: boolean; message?: string; saved?: number };
      if (!res.ok || data.ok === false) {
        setMessage(data.message ?? "Save failed.");
      } else {
        setMessage(`Saved ${data.saved ?? pairs.length} transfer pairs.`);
      }
    } catch (err) {
      setMessage(err instanceof Error ? err.message : "Save failed.");
    } finally {
      setSaving(false);
    }
  }

  function formatDate(d: string): string {
    const date = new Date(d + (d.includes("T") ? "" : "T00:00:00"));
    return date.toLocaleDateString("en-US", { month: "short", day: "numeric" });
  }

  return createPortal(
    <div
      className="fixed inset-0 z-[90] flex min-h-[100dvh] items-start justify-center bg-neutral-950/70 p-4 pt-12 backdrop-blur-sm overflow-y-auto"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
    >
      <div
        className="bg-white dark:bg-neutral-900 rounded-2xl shadow-2xl max-w-3xl w-full max-h-[90vh] flex flex-col border border-neutral-200 dark:border-neutral-700 overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="shrink-0 flex items-center justify-between px-4 py-3 border-b border-neutral-200 dark:border-neutral-700">
          <h2 className="text-sm font-semibold text-neutral-900 dark:text-neutral-100">Add Transfers</h2>
          <button type="button" onClick={onClose} className="rounded-lg p-1.5 text-neutral-500 hover:text-neutral-700 dark:hover:text-neutral-300" aria-label="Close">
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 6L18 18M18 6L6 18" /></svg>
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 min-h-0 overflow-y-auto p-4 space-y-4">
          {loading && <p className="text-sm text-neutral-500">Loading transfer statements...</p>}
          {message && <p className="text-xs text-amber-600 dark:text-amber-400">{message}</p>}

          {/* Paired transfers */}
          {pairs.length > 0 && (
            <div>
              <h3 className="text-xs font-semibold text-neutral-500 dark:text-neutral-400 uppercase tracking-wider mb-2">Paired Transfers ({pairs.length})</h3>
              <div className="space-y-2">
                {pairs.map((p) => {
                  const out = items.find((i) => i.id === p.outId);
                  const inp = items.find((i) => i.id === p.inId);
                  if (!out || !inp) return null;
                  return (
                    <div key={p.outId} className="rounded-lg border border-neutral-200 dark:border-neutral-700 p-3 space-y-2">
                      <div className="flex items-start justify-between gap-2">
                        <div className="flex-1 min-w-0 text-xs space-y-1">
                          <div className="flex gap-2 items-center">
                            <span className="text-red-600 dark:text-red-400 font-medium tabular-nums">{formatCurrency(Math.abs(out.amount))}</span>
                            <span className="text-neutral-400">→</span>
                            <span className="text-emerald-600 dark:text-emerald-400 font-medium tabular-nums">{formatCurrency(inp.amount)}</span>
                            <span className="text-neutral-500">{formatDate(out.date)}</span>
                          </div>
                          <p className="text-[11px] text-neutral-600 dark:text-neutral-400 truncate" title={out.description}>{out.description}</p>
                          <p className="text-[11px] text-neutral-600 dark:text-neutral-400 truncate" title={inp.description}>{inp.description}</p>
                        </div>
                        <button type="button" onClick={() => removePair(p.outId)} className="text-xs text-red-500 hover:text-red-600 shrink-0">Remove</button>
                      </div>
                      <div className="flex flex-wrap gap-2 text-xs">
                        <div className="flex items-center gap-1">
                          <span className="text-neutral-500">From:</span>
                          <select
                            value={p.fromAccount}
                            onChange={(e) => updatePair(p.outId, { fromAccount: e.target.value })}
                            className="rounded border border-neutral-300 dark:border-neutral-600 bg-white dark:bg-neutral-800 px-1.5 py-0.5 text-xs"
                          >
                            {ACCOUNT_OPTIONS.map((a) => <option key={a.value} value={a.value}>{a.label}</option>)}
                          </select>
                        </div>
                        <div className="flex items-center gap-1">
                          <span className="text-neutral-500">To:</span>
                          <select
                            value={p.toAccount}
                            onChange={(e) => updatePair(p.outId, { toAccount: e.target.value })}
                            className="rounded border border-neutral-300 dark:border-neutral-600 bg-white dark:bg-neutral-800 px-1.5 py-0.5 text-xs"
                          >
                            {ACCOUNT_OPTIONS.map((a) => <option key={a.value} value={a.value}>{a.label}</option>)}
                          </select>
                        </div>
                        <div className="flex items-center gap-1">
                          <span className="text-neutral-500">Goal:</span>
                          <select
                            value={p.goalId ?? ""}
                            onChange={(e) => updatePair(p.outId, { goalId: e.target.value || null })}
                            className="rounded border border-neutral-300 dark:border-neutral-600 bg-white dark:bg-neutral-800 px-1.5 py-0.5 text-xs"
                          >
                            <option value="">No goal</option>
                            {goals.map((g) => <option key={g.id} value={g.id}>{g.name}</option>)}
                          </select>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* Unpaired outflows */}
          {outflows.length > 0 && (
            <div>
              <h3 className="text-xs font-semibold text-neutral-500 dark:text-neutral-400 uppercase tracking-wider mb-2">Outflows (unpaired)</h3>
              <div className="space-y-1">
                {outflows.map((s) => (
                  <div key={s.id} className="flex items-center justify-between gap-2 py-1.5 border-b border-neutral-100 dark:border-neutral-800 last:border-0">
                    <div className="flex-1 min-w-0 text-xs">
                      <div className="flex gap-2 items-center">
                        <span className="text-red-600 dark:text-red-400 font-medium tabular-nums">{formatCurrency(Math.abs(s.amount))}</span>
                        <span className="text-neutral-500">{formatDate(s.date)}</span>
                      </div>
                      <p className="text-[11px] text-neutral-600 dark:text-neutral-400 truncate" title={s.description}>{s.description}</p>
                    </div>
                    {selectingPairFor === s.id ? (
                      <button type="button" onClick={() => setSelectingPairFor(null)} className="text-xs text-neutral-500 hover:text-neutral-700 shrink-0">Cancel</button>
                    ) : (
                      <button type="button" onClick={() => setSelectingPairFor(s.id)} className="text-xs text-sky-600 hover:text-sky-500 shrink-0">Pair</button>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Select inflow to pair (shown when selectingPairFor is set) */}
          {selectingPairFor && inflows.length > 0 && (
            <div className="rounded-lg border-2 border-sky-400 dark:border-sky-600 p-3">
              <p className="text-xs font-medium text-sky-700 dark:text-sky-300 mb-2">Select the matching inflow:</p>
              <div className="space-y-1">
                {inflows.map((s) => {
                  const outItem = items.find((i) => i.id === selectingPairFor);
                  const amountMatch = outItem && Math.abs(Math.abs(outItem.amount) - s.amount) < 0.01;
                  return (
                    <button
                      key={s.id}
                      type="button"
                      onClick={() => createPair(selectingPairFor!, s.id)}
                      className={`w-full text-left flex items-center justify-between gap-2 py-1.5 px-2 rounded-lg hover:bg-sky-50 dark:hover:bg-sky-900/30 transition-colors ${amountMatch ? "bg-emerald-50 dark:bg-emerald-900/20 border border-emerald-300 dark:border-emerald-700" : ""}`}
                    >
                      <div className="flex-1 min-w-0 text-xs">
                        <div className="flex gap-2 items-center">
                          <span className="text-emerald-600 dark:text-emerald-400 font-medium tabular-nums">{formatCurrency(s.amount)}</span>
                          <span className="text-neutral-500">{formatDate(s.date)}</span>
                          {amountMatch && <span className="text-[10px] text-emerald-600 dark:text-emerald-400">Amount match</span>}
                        </div>
                        <p className="text-[11px] text-neutral-600 dark:text-neutral-400 truncate">{s.description}</p>
                      </div>
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          {/* Unpaired inflows (when not selecting) */}
          {!selectingPairFor && inflows.length > 0 && (
            <div>
              <h3 className="text-xs font-semibold text-neutral-500 dark:text-neutral-400 uppercase tracking-wider mb-2">Inflows (unpaired)</h3>
              <div className="space-y-1">
                {inflows.map((s) => (
                  <div key={s.id} className="flex items-center justify-between gap-2 py-1.5 border-b border-neutral-100 dark:border-neutral-800 last:border-0">
                    <div className="flex-1 min-w-0 text-xs">
                      <div className="flex gap-2 items-center">
                        <span className="text-emerald-600 dark:text-emerald-400 font-medium tabular-nums">{formatCurrency(s.amount)}</span>
                        <span className="text-neutral-500">{formatDate(s.date)}</span>
                      </div>
                      <p className="text-[11px] text-neutral-600 dark:text-neutral-400 truncate" title={s.description}>{s.description}</p>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {!loading && items.length === 0 && (
            <p className="text-sm text-neutral-500 text-center py-8">No transfer-like statements found. Upload statement CSVs first.</p>
          )}
        </div>

        {/* Footer */}
        {pairs.length > 0 && (
          <div className="shrink-0 border-t border-neutral-200 dark:border-neutral-800 px-4 py-2 flex items-center justify-between">
            <span className="text-xs text-neutral-500">{pairs.length} pair{pairs.length !== 1 ? "s" : ""} · {unpaired.length} unpaired</span>
            <button
              type="button"
              onClick={() => void savePairs()}
              disabled={saving}
              className="rounded-lg bg-emerald-600 text-white px-4 py-1.5 text-sm font-medium hover:bg-emerald-500 disabled:opacity-50"
            >
              {saving ? "Saving…" : `Save ${pairs.length} pair${pairs.length !== 1 ? "s" : ""}`}
            </button>
          </div>
        )}
      </div>
    </div>,
    document.body
  );
}
