"use client";

import { useState, useEffect } from "react";
import type { StatementTagTargetType } from "@/lib/types";

const BATCH_SIZE = 10;

interface TagSuggestion {
  id: string;
  date: string;
  description: string;
  amount: number;
  suggestion: {
    targetType: StatementTagTargetType;
    targetSection: "bills_account" | "checking_account" | "spanish_fork" | null;
    targetName: string;
    goalId?: string | null;
    hasMatchedRule?: boolean; // High confidence - matches a learned rule
    confidence?: "HIGH" | "MEDIUM" | "LOW";
    matchType?: "exact_pattern" | "normalized_description" | "heuristic";
  };
}

interface Goal {
  id: string;
  name: string;
}

interface AddItemsToBillsModalProps {
  /** Controlled: when provided with onClose, modal visibility is controlled by parent (no trigger button). */
  open?: boolean;
  onClose?: () => void;
}

export function AddItemsToBillsModal({ open: controlledOpen, onClose }: AddItemsToBillsModalProps = {}) {
  const [internalOpen, setInternalOpen] = useState(false);
  const isControlled = controlledOpen !== undefined && onClose !== undefined;
  const open = isControlled ? controlledOpen : internalOpen;
  const closeModal = () => { if (isControlled) onClose?.(); else setInternalOpen(false); };
  const [tagSuggestions, setTagSuggestions] = useState<TagSuggestion[]>([]);
  const [tagEdits, setTagEdits] = useState<
    Record<string, { targetType: StatementTagTargetType; targetSection: "bills_account" | "checking_account" | "spanish_fork" | null; targetName: string; goalId?: string | null; wasAutoTagged?: boolean; originalSuggestion?: { targetType?: StatementTagTargetType; targetSection?: "bills_account" | "checking_account" | "spanish_fork" | null; targetName?: string } }>
  >({});
  const [savedIds, setSavedIds] = useState<Set<string>>(new Set());
  const [tagStatus, setTagStatus] = useState<"idle" | "loading" | "saving" | "success" | "error">("idle");
  const [tagMessage, setTagMessage] = useState("");
  const [subsections, setSubsections] = useState<{ bills: string[]; subscriptions: string[] }>({ bills: [], subscriptions: [] });
  const [billNames, setBillNames] = useState<Record<string, string[]>>({});
  const [goals, setGoals] = useState<Goal[]>([]);

  async function loadTagSuggestions() {
    setTagStatus("loading");
    setTagMessage("Loading…");
    setSavedIds(new Set());
    try {
      const res = await fetch("/api/statement-tags");
      const data = (await res.json()) as { ok?: boolean; items?: TagSuggestion[]; message?: string; subsections?: { bills?: string[]; subscriptions?: string[] }; billNames?: Record<string, string[]>; goals?: Goal[] };
      if (!res.ok || data.ok === false) {
        setTagStatus("error");
        setTagMessage(data.message ?? `Load failed (${res.status}).`);
        return;
      }
      const items = data.items ?? [];
      const subsectionsData = data.subsections ?? { bills: [], subscriptions: [] };
      const billNamesData = data.billNames ?? {};
      const goalsData = data.goals ?? [];
      setSubsections({ bills: subsectionsData.bills ?? [], subscriptions: subsectionsData.subscriptions ?? [] });
      setBillNames(billNamesData);
      setGoals(goalsData);
      if (items.length === 0) {
        setTagStatus("success");
        setTagMessage(data.message ?? "No statement rows found. Import statements first on the Statements page.");
        setTagSuggestions([]);
        return;
      }
      setTagSuggestions(items);
      const nextEdits: typeof tagEdits = {};
      items.forEach((t) => {
        const wasAutoTagged = t.suggestion.hasMatchedRule && t.suggestion.confidence === "HIGH";
        nextEdits[t.id] = {
          targetType: t.suggestion.targetType,
          targetSection: t.suggestion.targetSection,
          targetName: t.suggestion.targetName,
          goalId: t.suggestion.goalId ?? null,
          wasAutoTagged,
          originalSuggestion: wasAutoTagged ? {
            targetType: t.suggestion.targetType,
            targetSection: t.suggestion.targetSection,
            targetName: t.suggestion.targetName,
          } : undefined,
        };
      });
      setTagEdits(nextEdits);
      const autoTaggable = items.filter((t) => t.suggestion.hasMatchedRule).length;
      const manualReview = items.length - autoTaggable;
      setTagStatus("success");
      if (autoTaggable > 0) {
        setTagMessage(`Loaded ${items.length} rows. ${autoTaggable} can be auto-tagged, ${manualReview} need manual review.`);
      } else {
        setTagMessage(`Loaded ${items.length} rows. All need manual review. Save in batches of ${BATCH_SIZE}.`);
      }
    } catch (err) {
      setTagStatus("error");
      setTagMessage(err instanceof Error ? err.message : "Load failed.");
    }
  }

  async function saveBatch(batchSize: number) {
    const unsaved = tagSuggestions.filter((row) => !savedIds.has(row.id));
    const toSave = unsaved.slice(0, batchSize);
    if (toSave.length === 0) {
      setTagMessage("No unsaved rows.");
      return;
    }
    setTagStatus("saving");
    setTagMessage("");
    try {
      const items = toSave.map((t) => {
        const edit = tagEdits[t.id] ?? t.suggestion;
        const wasAutoTagged = edit.wasAutoTagged ?? false;
        const originalSuggestion = edit.originalSuggestion;
        // Check if user changed an auto-tagged suggestion
        const wasOverride = wasAutoTagged && originalSuggestion &&
          (originalSuggestion.targetType !== edit.targetType ||
           originalSuggestion.targetSection !== edit.targetSection ||
           originalSuggestion.targetName !== edit.targetName);
        return {
          statementId: t.id,
          targetType: edit.targetType,
          targetSection: edit.targetSection,
          targetName: edit.targetName,
          goalId: edit.goalId ?? null,
          wasAutoTagged: wasOverride ? true : undefined,
          originalSuggestion: wasOverride ? originalSuggestion : undefined,
        };
      });
      const res = await fetch("/api/statement-tags", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ items }),
      });
      const data = (await res.json()) as { ok?: boolean; message?: string; rulesCreated?: number; billsUpserted?: number };
      if (!res.ok || data.ok === false) {
        setTagStatus("error");
        setTagMessage(data.message ?? "Save failed.");
        return;
      }
      setSavedIds((prev) => {
        const next = new Set(prev);
        toSave.forEach((t) => next.add(t.id));
        return next;
      });
      setTagStatus("success");
      setTagMessage(data.message ?? `Saved ${toSave.length} tags (${data.rulesCreated ?? 0} rules, ${data.billsUpserted ?? 0} bills).`);
    } catch (err) {
      setTagStatus("error");
      setTagMessage(err instanceof Error ? err.message : "Save failed.");
    }
  }

  async function saveAllInBatches() {
    const all = tagSuggestions;
    const saved = new Set(savedIds);
    let unsaved = all.filter((row) => !saved.has(row.id));
    if (unsaved.length === 0) {
      setTagMessage("All rows already saved.");
      return;
    }
    setTagStatus("saving");
    setTagMessage(`Saving in batches of ${BATCH_SIZE}…`);
    let totalSaved = 0;
    while (unsaved.length > 0) {
      const batch = unsaved.slice(0, BATCH_SIZE);
      const items = batch.map((t) => {
        const edit = tagEdits[t.id] ?? t.suggestion;
        const wasAutoTagged = edit.wasAutoTagged ?? false;
        const originalSuggestion = edit.originalSuggestion;
        const wasOverride = wasAutoTagged && originalSuggestion &&
          (originalSuggestion.targetType !== edit.targetType ||
           originalSuggestion.targetSection !== edit.targetSection ||
           originalSuggestion.targetName !== edit.targetName);
        return {
          statementId: t.id,
          targetType: edit.targetType,
          targetSection: edit.targetSection,
          targetName: edit.targetName,
          goalId: edit.goalId ?? null,
          wasAutoTagged: wasOverride ? true : undefined,
          originalSuggestion: wasOverride ? originalSuggestion : undefined,
        };
      });
      const res = await fetch("/api/statement-tags", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ items }),
      });
      const data = (await res.json()) as { ok?: boolean; message?: string; rulesCreated?: number; billsUpserted?: number };
      if (!res.ok || data.ok === false) {
        setTagStatus("error");
        setTagMessage(data.message ?? "Save failed.");
        return;
      }
      batch.forEach((t) => saved.add(t.id));
      setSavedIds(new Set(saved));
      totalSaved += batch.length;
      setTagMessage(`Saved ${totalSaved} of ${all.length}…`);
      unsaved = all.filter((row) => !saved.has(row.id));
    }
    setTagStatus("success");
    setTagMessage(`Saved all ${totalSaved} tags.`);
  }

  const unsavedCount = tagSuggestions.filter((r) => !savedIds.has(r.id)).length;
  // Only auto-tag HIGH confidence exact pattern matches
  const autoTaggableCount = tagSuggestions.filter(
    (r) => !savedIds.has(r.id) && r.suggestion.hasMatchedRule && r.suggestion.confidence === "HIGH"
  ).length;
  const manualReviewCount = unsavedCount - autoTaggableCount;
  const [page, setPage] = useState(0);
  const totalPages = tagSuggestions.length > 0 ? Math.ceil(tagSuggestions.length / BATCH_SIZE) : 1;
  const currentPage = Math.min(page, totalPages - 1);
  const pageStart = currentPage * BATCH_SIZE;
  const pageEnd = pageStart + BATCH_SIZE;
  const visibleRows = tagSuggestions.slice(pageStart, pageEnd);

  async function autoTagMatchingRules() {
    // Only auto-tag HIGH confidence exact pattern matches
    const toAutoTag = tagSuggestions.filter(
      (r) => !savedIds.has(r.id) && r.suggestion.hasMatchedRule && r.suggestion.confidence === "HIGH"
    );
    if (toAutoTag.length === 0) {
      setTagMessage("No statements with matching rules to auto-tag.");
      return;
    }
    setTagStatus("saving");
    setTagMessage(`Auto-tagging ${toAutoTag.length} statements with matching rules…`);
    try {
      const items = toAutoTag.map((t) => {
        const edit = tagEdits[t.id] ?? t.suggestion;
        return {
          statementId: t.id,
          targetType: edit.targetType,
          targetSection: edit.targetSection,
          targetName: edit.targetName,
          goalId: edit.goalId ?? null,
          // Mark as auto-tagged for tracking
          wasAutoTagged: true,
        };
      });
      const res = await fetch("/api/statement-tags", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ items }),
      });
      const data = (await res.json()) as { ok?: boolean; message?: string; rulesCreated?: number; billsUpserted?: number };
      if (!res.ok || data.ok === false) {
        setTagStatus("error");
        setTagMessage(data.message ?? "Auto-tag failed.");
        return;
      }
      setSavedIds((prev) => {
        const next = new Set(prev);
        toAutoTag.forEach((t) => next.add(t.id));
        return next;
      });
      setTagStatus("success");
      setTagMessage(`Auto-tagged ${toAutoTag.length} statements! ${manualReviewCount} still need manual review.`);
    } catch (err) {
      setTagStatus("error");
      setTagMessage(err instanceof Error ? err.message : "Auto-tag failed.");
    }
  }

  useEffect(() => {
    if (open && tagSuggestions.length === 0 && tagStatus !== "loading") void loadTagSuggestions();
  }, [open]);

  const openModal = () => {
    if (!isControlled) setInternalOpen(true);
    if (tagSuggestions.length === 0) void loadTagSuggestions();
  };

  return (
    <>
      {!isControlled && (
        <button
          type="button"
          onClick={openModal}
          className="rounded-full bg-sky-600 text-white px-3 py-1.5 text-sm font-medium shadow-sm hover:bg-sky-500"
        >
          Add items to bills
        </button>
      )}

      {open && (
        <div
          className="fixed inset-0 z-50 flex min-h-screen items-center justify-center bg-neutral-950/60 px-4 backdrop-blur-sm"
          onClick={closeModal}
        >
          <div
            className="bg-gradient-to-b from-sky-50/60 via-white to-white dark:from-neutral-900 dark:via-neutral-950 dark:to-neutral-950 rounded-2xl shadow-2xl max-w-3xl w-[95vw] max-h-[80vh] flex flex-col border border-neutral-200/70 dark:border-neutral-800"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Header */}
            <div className="flex items-center justify-between border-b border-neutral-200/70 dark:border-neutral-800/80 px-4 py-3 bg-white/70 dark:bg-neutral-900/60 backdrop-blur-sm rounded-t-2xl">
              <h2 className="text-sm font-semibold tracking-wide text-neutral-900 dark:text-neutral-50">
                Add items to bills
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

            {/* Controls */}
            <div className="px-4 py-2 border-b border-neutral-100/80 dark:border-neutral-900/80 bg-white/60 dark:bg-neutral-950/40">
              {(tagStatus === "error" || tagMessage) && (
                <p
                  className={`text-sm ${
                    tagStatus === "error"
                      ? "text-red-600 dark:text-red-400"
                      : "text-neutral-600 dark:text-neutral-400"
                  }`}
                >
                  {tagMessage}
                </p>
              )}
              <div className="flex flex-wrap gap-2 mt-2 items-center">
                <button
                  type="button"
                  onClick={() => void loadTagSuggestions()}
                  disabled={tagStatus === "loading"}
                  className="rounded-lg bg-neutral-200 dark:bg-neutral-700 text-neutral-800 dark:text-neutral-200 px-3 py-1.5 text-sm font-medium hover:bg-neutral-300 dark:hover:bg-neutral-600 disabled:opacity-50"
                >
                  {tagStatus === "loading" ? "Loading…" : "Load statement rows"}
                </button>
                <span className="text-xs text-neutral-500 dark:text-neutral-400">
                  {tagSuggestions.length === 0
                    ? "No rows loaded yet."
                    : `${savedIds.size} saved · ${unsavedCount} left`}
                  {autoTaggableCount > 0 && (
                    <span className="ml-2 text-emerald-600 dark:text-emerald-400 font-medium">
                      ({autoTaggableCount} auto-taggable)
                    </span>
                  )}
                </span>
                {autoTaggableCount > 0 && (
                  <button
                    type="button"
                    onClick={() => void autoTagMatchingRules()}
                    disabled={tagStatus === "saving" || tagStatus === "loading"}
                    className="rounded-lg bg-emerald-600 text-white px-3 py-1.5 text-sm font-medium hover:bg-emerald-500 disabled:opacity-50"
                  >
                    {tagStatus === "saving" ? "Auto-tagging…" : `Auto-tag ${autoTaggableCount} matching`}
                  </button>
                )}
              </div>
            </div>

            {/* Body */}
            <div className="flex-1 p-4">
              {tagSuggestions.length === 0 && tagStatus !== "loading" && (
                <p className="text-sm text-neutral-600 dark:text-neutral-300">
                  Click &quot;Load statement rows&quot; to fetch statement lines from PocketBase and tag
                  them as bills or subscriptions.
                </p>
              )}
              {tagSuggestions.length > 0 && (
                <div className="space-y-1.5">
                  {visibleRows.map((row) => {
                    const edit = tagEdits[row.id] ?? row.suggestion;
                    const type = edit.targetType;
                    const sect = edit.targetSection;
                    const isSaved = savedIds.has(row.id);
                    const hasMatchedRule = row.suggestion.hasMatchedRule ?? false;
                    const confidence = row.suggestion.confidence ?? "LOW";
                    const isHighConfidence = confidence === "HIGH" && row.suggestion.matchType === "exact_pattern";
                    return (
                      <div
                        key={row.id}
                        className={`flex flex-wrap items-start gap-2 p-2 rounded-lg border ${
                          isSaved
                            ? "border-emerald-200 dark:border-emerald-700 bg-emerald-50/70 dark:bg-emerald-900/30"
                            : hasMatchedRule
                            ? "border-emerald-300 dark:border-emerald-800 bg-emerald-50/50 dark:bg-emerald-950/30"
                            : "border-sky-100 dark:border-sky-900/40 bg-sky-50/50 dark:bg-neutral-900/40"
                        }`}
                      >
                        <div className="flex-shrink-0 text-[10px] text-neutral-500 dark:text-neutral-400 w-14">
                          {row.date.slice(5)}
                        </div>
                        <div className="flex-1 min-w-[100px] text-xs text-neutral-800 dark:text-neutral-200 truncate">
                          {row.description}
                        </div>
                        <div className="flex-shrink-0 text-xs font-medium tabular-nums text-neutral-700 dark:text-neutral-300 w-14 text-right">
                          {row.amount.toFixed(2)}
                        </div>
                        {hasMatchedRule && !isSaved && (
                          <span
                            className={`text-[10px] font-medium ${
                              isHighConfidence
                                ? "text-emerald-600 dark:text-emerald-400"
                                : confidence === "MEDIUM"
                                ? "text-amber-600 dark:text-amber-400"
                                : "text-neutral-500 dark:text-neutral-400"
                            }`}
                            title={`Confidence: ${confidence} (${row.suggestion.matchType ?? "heuristic"})`}
                          >
                            {isHighConfidence ? "✓ High" : confidence === "MEDIUM" ? "~ Med" : "? Low"}
                          </span>
                        )}
                        {isSaved && (
                          <span className="text-[10px] text-emerald-600 dark:text-emerald-400 font-medium">
                            Saved
                          </span>
                        )}
                        <div className="flex-shrink-0 flex items-center gap-1 flex-wrap w-full sm:w-auto">
                          <select
                            className="text-[10px] rounded border border-neutral-300 dark:border-neutral-700 bg-white dark:bg-neutral-800 px-1.5 py-0.5 min-w-[72px]"
                            value={type}
                            onChange={(e) => {
                              const nextType = e.target.value as StatementTagTargetType;
                              const wasAutoTagged = edit.wasAutoTagged ?? false;
                              const originalSuggestion = edit.originalSuggestion;
                              setTagEdits((prev) => ({
                                ...prev,
                                [row.id]: {
                                  ...edit,
                                  targetType: nextType,
                                  // Track if user is overriding an auto-tag
                                  wasAutoTagged: wasAutoTagged ? true : undefined,
                                  originalSuggestion: wasAutoTagged && originalSuggestion ? originalSuggestion : undefined,
                                },
                              }));
                            }}
                          >
                            <option value="bill">Bill</option>
                            <option value="subscription">Sub</option>
                            <option value="spanish_fork">Spanish Fork</option>
                            <option value="auto_transfer">Auto</option>
                            <option value="ignore">Ignore</option>
                          </select>
                          {(type === "bill" || type === "subscription" || type === "spanish_fork") && (
                            <>
                              <select
                                className="text-[10px] rounded border border-neutral-300 dark:border-neutral-700 bg-white dark:bg-neutral-800 px-1.5 py-0.5 min-w-[90px]"
                                value={sect ?? "checking_account"}
                                onChange={(e) => {
                                  const nextSection = e.target.value as
                                    | "bills_account"
                                    | "checking_account"
                                    | "spanish_fork";
                                  const wasAutoTagged = edit.wasAutoTagged ?? false;
                                  const originalSuggestion = edit.originalSuggestion;
                                  setTagEdits((prev) => ({
                                    ...prev,
                                    [row.id]: {
                                      ...edit,
                                      targetSection: nextSection,
                                      wasAutoTagged: wasAutoTagged ? true : undefined,
                                      originalSuggestion: wasAutoTagged && originalSuggestion ? originalSuggestion : undefined,
                                    },
                                  }));
                                }}
                              >
                                <option value="bills_account">Bills Account</option>
                                <option value="checking_account">Checking</option>
                                <option value="spanish_fork">Spanish Fork</option>
                              </select>
                              <select
                                className="text-[10px] rounded border border-neutral-300 dark:border-neutral-700 bg-white dark:bg-neutral-800 px-1.5 py-0.5 min-w-[120px] max-w-[180px]"
                                value={edit.targetName}
                                onChange={(e) => {
                                  const wasAutoTagged = edit.wasAutoTagged ?? false;
                                  const originalSuggestion = edit.originalSuggestion;
                                  setTagEdits((prev) => ({
                                    ...prev,
                                    [row.id]: {
                                      ...edit,
                                      targetName: e.target.value,
                                      wasAutoTagged: wasAutoTagged ? true : undefined,
                                      originalSuggestion: wasAutoTagged && originalSuggestion ? originalSuggestion : undefined,
                                    },
                                  }));
                                }}
                              >
                                {(() => {
                                  const groupKey =
                                    sect === "spanish_fork"
                                      ? "spanish_fork"
                                      : `${sect}_${type === "subscription" ? "subscriptions" : "bills"}`;
                                  const primaryNames = billNames[groupKey] ?? [];
                                  const typeSubsections =
                                    type === "subscription"
                                      ? subsections.subscriptions
                                      : subsections.bills;
                                  const existingNames =
                                    primaryNames.length > 0 ? primaryNames : typeSubsections;
                                  const fromBillNames = Array.from(
                                    new Set(Object.values(billNames).flat() as string[])
                                  );
                                  const combined = Array.from(
                                    new Set([...fromBillNames, ...existingNames])
                                  );
                                  const options = combined.length > 0 ? combined : [edit.targetName];
                                  return options.map((name) => (
                                    <option key={name} value={name}>
                                      {name}
                                    </option>
                                  ));
                                })()}
                              </select>
                            </>
                          )}
                          {/* Goal selector - available for all statement types */}
                          <select
                            className="text-[10px] rounded border border-neutral-300 dark:border-neutral-700 bg-white dark:bg-neutral-800 px-1.5 py-0.5 min-w-[100px] max-w-[150px]"
                            value={edit.goalId ?? ""}
                            onChange={(e) => {
                              const wasAutoTagged = edit.wasAutoTagged ?? false;
                              const originalSuggestion = edit.originalSuggestion;
                              setTagEdits((prev) => ({
                                ...prev,
                                [row.id]: {
                                  ...edit,
                                  goalId: e.target.value || null,
                                  wasAutoTagged: wasAutoTagged ? true : undefined,
                                  originalSuggestion: wasAutoTagged && originalSuggestion ? originalSuggestion : undefined,
                                },
                              }));
                            }}
                          >
                            <option value="">No goal</option>
                            {goals.map((goal) => (
                              <option key={goal.id} value={goal.id}>
                                {goal.name}
                              </option>
                            ))}
                          </select>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>

            {/* Footer: pagination + save actions */}
            {tagSuggestions.length > 0 && (
              <div className="border-t border-neutral-200 dark:border-neutral-800 px-4 py-2 flex flex-wrap gap-2 items-center justify-between">
                <div className="flex flex-wrap gap-2 justify-start">
                  <button
                    type="button"
                    onClick={() => void saveBatch(BATCH_SIZE)}
                    disabled={tagStatus === "saving" || unsavedCount === 0}
                    className="rounded-lg bg-emerald-600 text-white px-3 py-1.5 text-sm font-medium hover:bg-emerald-500 disabled:opacity-50"
                  >
                    {tagStatus === "saving" ? "Saving…" : `Save next ${Math.min(BATCH_SIZE, unsavedCount) || BATCH_SIZE}`}
                  </button>
                  <button
                    type="button"
                    onClick={() => void saveAllInBatches()}
                    disabled={tagStatus === "saving" || unsavedCount === 0}
                    className="rounded-lg bg-emerald-700 text-white px-3 py-1.5 text-sm font-medium hover:bg-emerald-600 disabled:opacity-50"
                  >
                    Save all in batches of {BATCH_SIZE}
                  </button>
                </div>
                <div className="flex items-center gap-2 text-xs text-neutral-500 dark:text-neutral-400">
                  <button
                    type="button"
                    onClick={() => setPage((p) => Math.max(0, p - 1))}
                    disabled={currentPage === 0}
                    className="rounded-lg bg-neutral-200 dark:bg-neutral-800 text-neutral-800 dark:text-neutral-100 px-3 py-1 text-xs font-medium hover:bg-neutral-300 dark:hover:bg-neutral-700 disabled:opacity-50"
                  >
                    Prev
                  </button>
                  <button
                    type="button"
                    onClick={() => setPage((p) => Math.min(totalPages - 1, p + 1))}
                    disabled={currentPage >= totalPages - 1}
                    className="rounded-lg bg-sky-600 dark:bg-sky-500 text-white px-3 py-1 text-xs font-medium hover:bg-sky-500 dark:hover:bg-sky-400 disabled:opacity-50"
                  >
                    Next
                  </button>
                  <span className="whitespace-nowrap">
                    Showing {pageStart + 1}–{Math.min(pageEnd, tagSuggestions.length)} of {tagSuggestions.length}
                  </span>
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </>
  );
}
