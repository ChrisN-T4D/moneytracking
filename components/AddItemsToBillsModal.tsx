"use client";

import { useState, useEffect } from "react";
import { createPortal } from "react-dom";
import { useRouter } from "next/navigation";
import type { StatementTagTargetType } from "@/lib/types";
import { displayBillName } from "@/lib/format";
import { makeStatementPattern } from "@/lib/statementTagging";

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
  const router = useRouter();
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
  const [resetTagsStatus, setResetTagsStatus] = useState<"idle" | "loading" | "error">("idle");
  const [subsections, setSubsections] = useState<{ bills: string[]; subscriptions: string[] }>({ bills: [], subscriptions: [] });
  const [billNames, setBillNames] = useState<Record<string, string[]>>({});
  const [customSubsectionsByGroup, setCustomSubsectionsByGroup] = useState<Record<string, string[]>>({});
  const [goals, setGoals] = useState<Goal[]>([]);

  // Single selector: value is "variable_expense" | "ignore" | "groupKey|name"
  const GROUP_KEYS = [
    "bills_account_bills",
    "bills_account_subscriptions",
    "checking_account_bills",
    "checking_account_subscriptions",
    "spanish_fork",
  ] as const;
  const GROUP_LABELS: Record<string, string> = {
    bills_account_bills: "Bills (Bills Account)",
    bills_account_subscriptions: "Subscriptions (Bills Account)",
    checking_account_bills: "Bills (Checking)",
    checking_account_subscriptions: "Subscriptions (Checking)",
    spanish_fork: "Spanish Fork",
  };
  function editToSelectValue(edit: { targetType: StatementTagTargetType; targetSection: "bills_account" | "checking_account" | "spanish_fork" | null; targetName: string }): string {
    if (edit.targetType === "variable_expense") return "variable_expense";
    if (edit.targetType === "ignore") return "ignore";
    if (edit.targetType === "auto_transfer") return "auto_transfer";
    if (!edit.targetSection || !edit.targetName) return "ignore";
    const groupKey =
      edit.targetSection === "spanish_fork"
        ? "spanish_fork"
        : `${edit.targetSection}_${edit.targetType === "subscription" ? "subscriptions" : "bills"}`;
    return `${groupKey}|${edit.targetName}`;
  }
  function selectValueToEdit(value: string): { targetType: StatementTagTargetType; targetSection: "bills_account" | "checking_account" | "spanish_fork" | null; targetName: string } {
    if (value === "variable_expense")
      return { targetType: "variable_expense", targetSection: "checking_account", targetName: "Variable expenses" };
    if (value === "ignore") return { targetType: "ignore", targetSection: null, targetName: "" };
    if (value === "auto_transfer") return { targetType: "auto_transfer", targetSection: null, targetName: "" };
    const pipe = value.indexOf("|");
    if (pipe < 0) return { targetType: "ignore", targetSection: null, targetName: "" };
    const groupKey = value.slice(0, pipe);
    const targetName = value.slice(pipe + 1);
    if (groupKey === "spanish_fork")
      return { targetType: "spanish_fork", targetSection: "spanish_fork", targetName };
    const [section, listType] = groupKey === "bills_account_bills"
      ? ["bills_account", "bill"]
      : groupKey === "bills_account_subscriptions"
      ? ["bills_account", "subscription"]
      : groupKey === "checking_account_bills"
      ? ["checking_account", "bill"]
      : ["checking_account", "subscription"];
    return {
      targetType: listType as "bill" | "subscription",
      targetSection: section as "bills_account" | "checking_account",
      targetName,
    };
  }

  // Apply session-based suggestions: use tags the user has set so far to guess tags for other rows with the same pattern.
  // Only update state when we actually add new keys so we don't cause an infinite loop (setTagEdits → tagEdits change → effect re-runs).
  useEffect(() => {
    if (tagSuggestions.length === 0) return;
    setTagEdits((prev) => {
      const sessionPatternToTag: Record<
        string,
        { targetType: StatementTagTargetType; targetSection: "bills_account" | "checking_account" | "spanish_fork" | null; targetName: string; goalId?: string | null }
      > = {};
      for (const row of tagSuggestions) {
        const edit = prev[row.id];
        if (!edit?.targetType || edit.targetSection == null || !edit.targetName?.trim()) continue;
        const pattern = makeStatementPattern(row.description);
        if (!pattern) continue;
        sessionPatternToTag[pattern] = {
          targetType: edit.targetType,
          targetSection: edit.targetSection,
          targetName: edit.targetName.trim(),
          goalId: edit.goalId ?? null,
        };
      }
      const next = { ...prev };
      let didChange = false;
      for (const row of tagSuggestions) {
        if (prev[row.id] !== undefined) continue;
        const pattern = makeStatementPattern(row.description);
        const session = pattern ? sessionPatternToTag[pattern] : undefined;
        if (!session) continue;
        next[row.id] = {
          ...row.suggestion,
          targetType: session.targetType,
          targetSection: session.targetSection,
          targetName: session.targetName,
          goalId: session.goalId ?? null,
        };
        didChange = true;
      }
      return didChange ? next : prev;
    });
  }, [tagSuggestions]);

  async function loadTagSuggestions() {
    setTagStatus("loading");
    setTagMessage("Loading…");
    setSavedIds(new Set());
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 30000); // 30s timeout
    try {
      const res = await fetch("/api/statement-tags", { signal: controller.signal });
      clearTimeout(timeoutId);
      let data: { ok?: boolean; items?: TagSuggestion[]; message?: string; subsections?: { bills?: string[]; subscriptions?: string[] }; billNames?: Record<string, string[]>; goals?: Goal[] };
      try {
        data = (await res.json()) as typeof data;
      } catch {
        setTagStatus("error");
        setTagMessage(`Server returned non-JSON (${res.status}). Is the dev server running? Try: npm run dev`);
        return;
      }
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
      clearTimeout(timeoutId);
      setTagStatus("error");
      if (err instanceof Error) {
        if (err.name === "AbortError") {
          setTagMessage("Request timed out. Check that PocketBase and the dev server are running.");
        } else if (err.message === "Failed to fetch" || err.message.includes("NetworkError")) {
          setTagMessage("Cannot reach the server. Start the app with: npm run dev (port 3001).");
        } else {
          setTagMessage(err.message);
        }
      } else {
        setTagMessage("Load failed.");
      }
    }
  }

  async function saveBatch(batchSize: number) {
    const unsaved = tagSuggestions.filter((row) => !savedIds.has(row.id));
    const toSave = unsaved.slice(0, batchSize);
    if (toSave.length === 0) {
      setTagMessage("No unsaved rows.");
      return;
    }
    await runSaveBatch(toSave);
  }

  /** Save the currently displayed rows (new tags and any changed tags; updates rules so old tag is replaced by new). */
  async function saveVisibleBatch() {
    const nextBatch = newRowsByDate.slice(0, BATCH_SIZE);
    if (nextBatch.length === 0) {
      setTagMessage("No rows on this page.");
      return;
    }
    await runSaveBatch(nextBatch);
  }

  async function runSaveBatch(toSave: typeof tagSuggestions) {
    setTagStatus("saving");
    setTagMessage("");
    try {
      const items = toSave.map((t) => {
        const edit = tagEdits[t.id] ?? t.suggestion;
        const wasAutoTagged = edit.wasAutoTagged ?? false;
        const originalSuggestion = edit.originalSuggestion;
        const wasOverride = wasAutoTagged && originalSuggestion &&
          (originalSuggestion.targetType !== edit.targetType ||
           originalSuggestion.targetSection !== edit.targetSection ||
           originalSuggestion.targetName !== edit.targetName);
        return {
          statementId: t.id,
          description: t.description, // sent so server doesn't need to re-fetch
          amount: t.amount,           // sent so server doesn't need to re-fetch
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
      // Populate subsection dropdown for other rows: add saved targetNames to customSubsectionsByGroup
      setCustomSubsectionsByGroup((prev) => {
        const next = { ...prev };
        for (const t of toSave) {
          const edit = tagEdits[t.id] ?? t.suggestion;
          if (!edit.targetName || !edit.targetSection) continue;
          if (edit.targetType !== "bill" && edit.targetType !== "subscription" && edit.targetType !== "spanish_fork") continue;
          const groupKey =
            edit.targetSection === "spanish_fork"
              ? "spanish_fork"
              : `${edit.targetSection}_${edit.targetType === "subscription" ? "subscriptions" : "bills"}`;
          const list = next[groupKey] ?? [];
          if (!list.includes(edit.targetName)) next[groupKey] = [...list, edit.targetName];
        }
        return next;
      });
      setTagStatus("success");
      setTagMessage(data.message ?? `Saved ${toSave.length} tags (${data.rulesCreated ?? 0} rules, ${data.billsUpserted ?? 0} bills).`);
      router.refresh(); // Re-fetch so Current money status and bills "paid this month" update
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
          description: t.description,
          amount: t.amount,
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
    router.refresh(); // Re-fetch so Current money status and bills "paid this month" update
  }

  const unsavedCount = tagSuggestions.filter((r) => !savedIds.has(r.id)).length;
  // Since we no longer return pre-matched items, autoTaggableCount is always 0
  const autoTaggableCount = 0;
  const [showTagged, setShowTagged] = useState(false);
  const [page, setPage] = useState(0);

  const untaggedRows = tagSuggestions.filter((r) => !r.suggestion.hasMatchedRule);
  const taggedRows = tagSuggestions.filter((r) => r.suggestion.hasMatchedRule);
  const alreadySavedRows = tagSuggestions.filter((r) => savedIds.has(r.id));
  const newRowsByDate = tagSuggestions
    .filter((r) => !savedIds.has(r.id))
    .sort((a, b) => b.date.localeCompare(a.date));
  const filteredRows = showTagged ? tagSuggestions : untaggedRows;
  const totalPages = filteredRows.length > 0 ? Math.ceil(filteredRows.length / BATCH_SIZE) : 1;
  const currentPage = Math.min(page, totalPages - 1);
  const pageStart = currentPage * BATCH_SIZE;
  const pageEnd = pageStart + BATCH_SIZE;
  const visibleRows = filteredRows.slice(pageStart, pageEnd);

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
          description: t.description,
          amount: t.amount,
          targetType: edit.targetType,
          targetSection: edit.targetSection,
          targetName: edit.targetName,
          goalId: edit.goalId ?? null,
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
      setTagMessage(`Auto-tagged ${toAutoTag.length} statements!`);
      router.refresh(); // Re-fetch so Current money status and bills "paid this month" update
    } catch (err) {
      setTagStatus("error");
      setTagMessage(err instanceof Error ? err.message : "Auto-tag failed.");
    }
  }

  async function handleResetTags() {
    if (!confirm("Reset all tags? This will delete every categorization rule (e.g. Dog Grooming, Walmart). You can re-tag from scratch. Continue?")) return;
    setResetTagsStatus("loading");
    setTagMessage("");
    try {
      const res = await fetch("/api/statement-tags/reset", { method: "DELETE", credentials: "include" });
      const data = (await res.json()) as { ok?: boolean; deleted?: number; message?: string };
      if (res.ok && data.ok) {
        setTagSuggestions([]);
        setSavedIds(new Set());
        setTagEdits({});
        setTagStatus("idle");
        setTagMessage(`Reset complete. Deleted ${data.deleted ?? 0} rule(s). Click "Load statement rows" to re-categorize.`);
        setResetTagsStatus("idle");
        router.refresh();
      } else {
        setResetTagsStatus("idle");
        setTagStatus("error");
        setTagMessage(data.message ?? "Reset failed.");
      }
    } catch (err) {
      setResetTagsStatus("idle");
      setTagStatus("error");
      setTagMessage(err instanceof Error ? err.message : "Reset failed.");
    }
  }

  useEffect(() => {
    if (open && tagSuggestions.length === 0 && tagStatus !== "loading") void loadTagSuggestions();
  }, [open]);

  // Lock body scroll when modal is open so only the modal content scrolls
  useEffect(() => {
    if (!open) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
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

      {open &&
        typeof document !== "undefined" &&
        createPortal(
          <div
            className="fixed inset-0 z-[100] flex min-h-[100dvh] items-center justify-center bg-neutral-950/70 p-4 backdrop-blur-sm"
            onClick={closeModal}
            role="dialog"
            aria-modal="true"
            aria-labelledby="add-items-to-bills-title"
          >
            <div
              className="bg-gradient-to-b from-sky-50/60 via-white to-white dark:from-neutral-900 dark:via-neutral-950 dark:to-neutral-950 rounded-2xl shadow-2xl max-w-3xl w-full max-h-[90dvh] flex flex-col border border-neutral-200/70 dark:border-neutral-800 overflow-hidden"
              onClick={(e) => e.stopPropagation()}
            >
              {/* Header */}
              <div className="flex shrink-0 items-center justify-between border-b border-neutral-200/70 dark:border-neutral-800/80 px-4 py-3 bg-white/70 dark:bg-neutral-900/60 backdrop-blur-sm rounded-t-2xl">
              <h2 id="add-items-to-bills-title" className="text-sm font-semibold tracking-wide text-neutral-900 dark:text-neutral-50">
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
            <div className="shrink-0 px-4 py-2 border-b border-neutral-100/80 dark:border-neutral-900/80 bg-white/60 dark:bg-neutral-950/40">
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
                    : `${newRowsByDate.length} to categorize · ${alreadySavedRows.length} saved this session`}
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
                <button
                  type="button"
                  onClick={() => void handleResetTags()}
                  disabled={resetTagsStatus === "loading" || tagStatus === "loading"}
                  className="rounded-lg border border-amber-300 dark:border-amber-700 bg-amber-50 dark:bg-amber-950/40 text-amber-800 dark:text-amber-200 px-3 py-1.5 text-sm font-medium hover:bg-amber-100 dark:hover:bg-amber-900/50 disabled:opacity-50"
                  title="Clear all categorization rules and re-tag from scratch"
                >
                  {resetTagsStatus === "loading" ? "Resetting…" : "Reset all tags"}
                </button>
              </div>
            </div>

            {/* Body - scrollable */}
            <div className="flex-1 min-h-0 overflow-y-auto p-4">
              {tagSuggestions.length === 0 && tagStatus !== "loading" && (
                <p className="text-sm text-neutral-600 dark:text-neutral-300">
                  {tagStatus === "success"
                    ? "All done! Every statement has been categorized."
                    : 'Click "Load statement rows" to fetch statement lines from PocketBase and tag them.'}
                </p>
              )}
              {tagSuggestions.length > 0 && (
                <div className="space-y-4">
                  <p className="text-xs text-neutral-500 dark:text-neutral-400">
                    Assign each row to a bill, variable expenses, or ignore. Save when done.
                  </p>
                  {newRowsByDate.length > 0 && (
                    <div>
                      <h3 className="text-xs font-semibold text-neutral-600 dark:text-neutral-300 mb-2 border-b border-neutral-200 dark:border-neutral-700 pb-1">
                        New (by date)
                      </h3>
                      <div className="space-y-1.5">
                        {newRowsByDate.map((row) => {
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
                        <div
                          className="flex-1 min-w-[100px] max-w-[420px] text-xs text-neutral-800 dark:text-neutral-200 line-clamp-3 break-words"
                          title={row.description}
                        >
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
                            className="text-[10px] rounded border border-neutral-300 dark:border-neutral-700 bg-white dark:bg-neutral-800 px-1.5 py-0.5 min-w-[140px] max-w-[220px]"
                            value={editToSelectValue(edit)}
                            onChange={(e) => {
                              const parsed = selectValueToEdit(e.target.value);
                              const wasAutoTagged = edit.wasAutoTagged ?? false;
                              const originalSuggestion = edit.originalSuggestion;
                              setTagEdits((prev) => ({
                                ...prev,
                                [row.id]: {
                                  ...edit,
                                  targetType: parsed.targetType,
                                  targetSection: parsed.targetSection,
                                  targetName: parsed.targetName,
                                  wasAutoTagged: wasAutoTagged ? true : undefined,
                                  originalSuggestion: wasAutoTagged && originalSuggestion ? originalSuggestion : undefined,
                                },
                              }));
                            }}
                          >
                            <option value="variable_expense">Variable expenses</option>
                            <option value="ignore">Ignore</option>
                            <option value="auto_transfer">Auto transfer</option>
                            {GROUP_KEYS.map((groupKey) => {
                              const names = [...new Set([...(billNames[groupKey] ?? []), ...(customSubsectionsByGroup[groupKey] ?? [])])];
                              if (names.length === 0) return null;
                              return (
                                <optgroup key={groupKey} label={GROUP_LABELS[groupKey] ?? groupKey}>
                                  {names.map((name) => (
                                    <option key={name} value={`${groupKey}|${name}`}>
                                      {displayBillName(name)}
                                    </option>
                                  ))}
                                </optgroup>
                              );
                            })}
                          </select>
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
                    </div>
                  )}
                  {alreadySavedRows.length > 0 && (
                    <div>
                      <h3 className="text-xs font-semibold text-neutral-600 dark:text-neutral-300 mb-2 border-b border-neutral-200 dark:border-neutral-700 pb-1">
                        Already saved
                      </h3>
                      <div className="space-y-1.5 rounded-lg bg-neutral-50 dark:bg-neutral-900/50 p-2">
                        {alreadySavedRows.map((row) => {
                          const edit = tagEdits[row.id] ?? row.suggestion;
                          const isSaved = true;
                          const hasMatchedRule = row.suggestion.hasMatchedRule ?? false;
                          const confidence = row.suggestion.confidence ?? "LOW";
                          const isHighConfidence = confidence === "HIGH" && row.suggestion.matchType === "exact_pattern";
                          return (
                            <div
                              key={row.id}
                              className={`flex flex-wrap items-start gap-2 p-2 rounded-lg border border-emerald-200 dark:border-emerald-700 bg-emerald-50/70 dark:bg-emerald-900/30`}
                            >
                              <div className="flex-shrink-0 text-[10px] text-neutral-500 dark:text-neutral-400 w-14">
                                {row.date.slice(5)}
                              </div>
                              <div className="flex-1 min-w-[100px] max-w-[420px] text-xs text-neutral-800 dark:text-neutral-200 line-clamp-3 break-words" title={row.description}>
                                {row.description}
                              </div>
                              <div className="flex-shrink-0 text-xs font-medium tabular-nums text-neutral-700 dark:text-neutral-300 w-14 text-right">
                                {row.amount.toFixed(2)}
                              </div>
                              <span className="text-[10px] text-emerald-600 dark:text-emerald-400 font-medium">Saved</span>
                              <div className="flex-shrink-0 flex items-center gap-1 flex-wrap w-full sm:w-auto">
                                <select
                                  className="text-[10px] rounded border border-neutral-300 dark:border-neutral-700 bg-white dark:bg-neutral-800 px-1.5 py-0.5 min-w-[140px] max-w-[220px]"
                                  value={editToSelectValue(edit)}
                                  onChange={(e) => {
                                    const parsed = selectValueToEdit(e.target.value);
                                    setTagEdits((prev) => ({
                                      ...prev,
                                      [row.id]: { ...edit, targetType: parsed.targetType, targetSection: parsed.targetSection, targetName: parsed.targetName },
                                    }));
                                  }}
                                >
                                  <option value="variable_expense">Variable expenses</option>
                                  <option value="ignore">Ignore</option>
                                  <option value="auto_transfer">Auto transfer</option>
                                  {GROUP_KEYS.map((groupKey) => {
                                    const names = [...new Set([...(billNames[groupKey] ?? []), ...(customSubsectionsByGroup[groupKey] ?? [])])];
                                    if (names.length === 0) return null;
                                    return (
                                      <optgroup key={groupKey} label={GROUP_LABELS[groupKey] ?? groupKey}>
                                        {names.map((name) => (
                                          <option key={name} value={`${groupKey}|${name}`}>{displayBillName(name)}</option>
                                        ))}
                                      </optgroup>
                                    );
                                  })}
                                </select>
                                <select
                                  className="text-[10px] rounded border border-neutral-300 dark:border-neutral-700 bg-white dark:bg-neutral-800 px-1.5 py-0.5 min-w-[100px] max-w-[150px]"
                                  value={edit.goalId ?? ""}
                                  onChange={(e) =>
                                    setTagEdits((prev) => ({
                                      ...prev,
                                      [row.id]: { ...edit, goalId: e.target.value || null },
                                    }))
                                  }
                                >
                                  <option value="">No goal</option>
                                  {goals.map((goal) => (
                                    <option key={goal.id} value={goal.id}>{goal.name}</option>
                                  ))}
                                </select>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>

            {/* Footer: pagination + save actions */}
            {tagSuggestions.length > 0 && (
              <div className="shrink-0 border-t border-neutral-200 dark:border-neutral-800 px-4 py-2 flex flex-wrap gap-2 items-center justify-between">
                <div className="flex flex-wrap gap-2 justify-start">
                  <button
                    type="button"
                    onClick={() => void saveVisibleBatch()}
                    disabled={tagStatus === "saving" || newRowsByDate.length === 0}
                    className="rounded-lg bg-emerald-600 text-white px-3 py-1.5 text-sm font-medium hover:bg-emerald-500 disabled:opacity-50"
                    title="Save all displayed rows (new tags and tag changes; replaces old tag with new)"
                  >
                    {tagStatus === "saving" ? "Saving…" : `Save next ${Math.min(BATCH_SIZE, unsavedCount)}`}
                  </button>
                  <button
                    type="button"
                    onClick={() => void saveAllInBatches()}
                    disabled={tagStatus === "saving" || unsavedCount === 0}
                    className="rounded-lg bg-emerald-700 text-white px-3 py-1.5 text-sm font-medium hover:bg-emerald-600 disabled:opacity-50"
                  >
                    Save all ({unsavedCount}) in batches of {BATCH_SIZE}
                  </button>
                </div>
                <span className="text-xs text-neutral-500 dark:text-neutral-400">
                  {unsavedCount} unsaved · {alreadySavedRows.length} saved this session
                </span>
              </div>
            )}
          </div>
        </div>,
          document.body
        )}
    </>
  );
}
