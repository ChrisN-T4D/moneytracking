"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import type { StatementTagTargetType } from "@/lib/types";
import { displayBillName } from "@/lib/format";

interface SuggestedPaycheck {
  name: string;
  frequency: string;
  anchorDate: string;
  amount: number;
  count: number;
  lastDate: string;
}

interface SuggestedAutoTransfer {
  whatFor: string;
  frequency: string;
  account: string;
  date: string;
  amount: number;
  count: number;
}

/** Matches main page sections: Bills (Bills Account), Subscriptions (Bills Account), etc. */
type BillGroupKey = "bills_account_bills" | "bills_account_subscriptions" | "checking_account_bills" | "checking_account_subscriptions" | "spanish_fork";

interface SuggestedBill {
  name: string;
  frequency: string;
  amount: number;
  count: number;
  lastDate: string;
  suggestedGroup?: { section: "bills_account" | "checking_account" | "spanish_fork"; listType: "bills" | "subscriptions" };
}

interface TagSuggestion {
  id: string;
  date: string;
  description: string;
  amount: number;
  suggestion: {
    targetType: StatementTagTargetType;
    targetSection: "bills_account" | "checking_account" | "spanish_fork" | null;
    targetName: string; // In PocketBase: name = subsection, so this IS the subsection
  };
}

export default function StatementsPage() {
  const router = useRouter();
  const [files, setFiles] = useState<File[]>([]);
  const [fileInputKey, setFileInputKey] = useState(0);
  const [account, setAccount] = useState("");
  const [status, setStatus] = useState<"idle" | "loading" | "success" | "error">("idle");
  const [message, setMessage] = useState("");
  const [result, setResult] = useState<Record<string, unknown> | null>(null);

  const [fillStatus, setFillStatus] = useState<"idle" | "loading" | "success" | "error">("idle");
  const [fillMessage, setFillMessage] = useState("");
  const [suggestedPaychecks, setSuggestedPaychecks] = useState<SuggestedPaycheck[]>([]);
  const [suggestedAutoTransfers, setSuggestedAutoTransfers] = useState<SuggestedAutoTransfer[]>([]);
  const [suggestedBills, setSuggestedBills] = useState<SuggestedBill[]>([]);
  const [selectedPaycheckIndices, setSelectedPaycheckIndices] = useState<Set<number>>(new Set());
  const [selectedBillIndices, setSelectedBillIndices] = useState<Set<number>>(new Set());
  /** Per-paycheck frequency override: index -> "biweekly" | "monthly" | "monthlyLastWorkingDay" */
  const [paycheckFrequencyByIndex, setPaycheckFrequencyByIndex] = useState<Record<number, string>>({});
  /** Per-bill options: group (matches main page section), frequency */
  const [billOptionsByIndex, setBillOptionsByIndex] = useState<
    Record<number, { section: "bills_account" | "checking_account" | "spanish_fork"; listType: "bills" | "subscriptions"; frequency: string }>
  >({});
  const [tagSuggestions, setTagSuggestions] = useState<TagSuggestion[]>([]);
  const [tagEdits, setTagEdits] = useState<
    Record<
      string,
      {
        targetType: StatementTagTargetType;
        targetSection: "bills_account" | "checking_account" | "spanish_fork" | null;
        targetName: string; // In PocketBase: name = subsection
      }
    >
  >({});
  const [tagStatus, setTagStatus] = useState<"idle" | "loading" | "saving" | "success" | "error">("idle");
  const [tagMessage, setTagMessage] = useState("");
  const [subsections, setSubsections] = useState<{ bills: string[]; subscriptions: string[] }>({
    bills: [],
    subscriptions: [],
  });
  const [billNames, setBillNames] = useState<Record<string, string[]>>({});
  const [wizardOpen, setWizardOpen] = useState(false);
  /** 1 = Upload, 2 = Paychecks, 3 = Add items */
  const [wizardStep, setWizardStep] = useState<1 | 2 | 3>(1);

  const groupKeyFrom = (section: string, listType: string) =>
    section === "spanish_fork" ? "spanish_fork" : `${section}_${listType}`;
  const groupKeyToSectionListType = (key: BillGroupKey): { section: "bills_account" | "checking_account" | "spanish_fork"; listType: "bills" | "subscriptions" } => {
    if (key === "spanish_fork") return { section: "spanish_fork", listType: "bills" };
    if (key === "bills_account_bills") return { section: "bills_account", listType: "bills" };
    if (key === "bills_account_subscriptions") return { section: "bills_account", listType: "subscriptions" };
    if (key === "checking_account_bills") return { section: "checking_account", listType: "bills" };
    return { section: "checking_account", listType: "subscriptions" };
  };
  const MAIN_PAGE_GROUP_ORDER: BillGroupKey[] = [
    "bills_account_bills",
    "bills_account_subscriptions",
    "checking_account_bills",
    "checking_account_subscriptions",
    "spanish_fork",
  ];
  const GROUP_TITLES: Record<BillGroupKey, string> = {
    bills_account_bills: "Bills (Bills Account)",
    bills_account_subscriptions: "Subscriptions (Bills Account)",
    checking_account_bills: "Bills (Checking Account)",
    checking_account_subscriptions: "Subscriptions (Checking Account)",
    spanish_fork: "Spanish Fork (Rental)",
  };
  const [applying, setApplying] = useState(false);

  const [deleteAllStatus, setDeleteAllStatus] = useState<"idle" | "loading" | "success" | "error">("idle");
  const [deleteAllMessage, setDeleteAllMessage] = useState("");
  const [resetTagsStatus, setResetTagsStatus] = useState<"idle" | "loading" | "success" | "error">("idle");
  const [resetTagsMessage, setResetTagsMessage] = useState("");

  async function handleResetTags() {
    if (!confirm("Reset all tags? This will delete all categorization rules. You can re-categorize from \"Add items to bills\" on the main page. Continue?")) return;
    setResetTagsStatus("loading");
    setResetTagsMessage("");
    try {
      const res = await fetch("/api/statement-tags/reset", { method: "DELETE", credentials: "include" });
      const data = (await res.json()) as { ok?: boolean; deleted?: number; message?: string };
      if (res.ok && data.ok) {
        setResetTagsStatus("success");
        setResetTagsMessage(data.message ?? `Reset complete. Deleted ${data.deleted ?? 0} tag rule(s).`);
        router.refresh();
      } else {
        setResetTagsStatus("error");
        setResetTagsMessage(data.message ?? "Reset failed.");
      }
    } catch (err) {
      setResetTagsStatus("error");
      setResetTagsMessage(err instanceof Error ? err.message : "Reset failed.");
    }
  }

  async function handleDeleteAll() {
    if (!confirm("Delete all rows in the statements collection? This cannot be undone.")) return;
    setDeleteAllStatus("loading");
    setDeleteAllMessage("");
    try {
      const res = await fetch("/api/statements/delete-all", { method: "DELETE", credentials: "include" });
      const data = (await res.json()) as { ok?: boolean; deleted?: number; message?: string };
      if (res.ok && data.ok) {
        setDeleteAllStatus("success");
        setDeleteAllMessage(data.message ?? `Deleted ${data.deleted ?? 0} statement(s).`);
      } else {
        setDeleteAllStatus("error");
        setDeleteAllMessage(data.message ?? "Delete failed.");
      }
    } catch (err) {
      setDeleteAllStatus("error");
      setDeleteAllMessage(err instanceof Error ? err.message : "Delete failed.");
    }
  }

  // When opened from hamburger "Add paychecks from statements", scroll to this section
  useEffect(() => {
    if (typeof window !== "undefined" && window.location.hash === "#fill-from-statements") {
      document.getElementById("fill-from-statements")?.scrollIntoView({ behavior: "smooth", block: "start" });
    }
  }, []);

  function groupKeyFromTypeAndSection(
    targetType: StatementTagTargetType,
    section: "bills_account" | "checking_account" | "spanish_fork" | null
  ): BillGroupKey {
    if (section === "spanish_fork") return "spanish_fork";
    if (section === "bills_account") {
      return targetType === "subscription" ? "bills_account_subscriptions" : "bills_account_bills";
    }
    // default to checking account
    return targetType === "subscription" ? "checking_account_subscriptions" : "checking_account_bills";
  }

  async function runImport(): Promise<boolean> {
    if (files.length === 0) {
      setStatus("error");
      setMessage("Choose at least one CSV or PDF file.");
      return false;
    }
    setStatus("loading");
    setMessage("");
    setResult(null);
    const accountVal = account.trim();
    const results: Array<{ file: string; ok: boolean; imported: number; total: number; skipped?: number; message?: string }> = [];
    let totalImported = 0;
    try {
      for (const file of files) {
        const formData = new FormData();
        formData.set("file", file);
        if (accountVal) formData.set("account", accountVal);
        const res = await fetch("/api/statements/import", {
          method: "POST",
          body: formData,
        });
        const data = (await res.json()) as Record<string, unknown>;
        const imported = typeof data.imported === "number" ? data.imported : 0;
        const total = typeof data.total === "number" ? data.total : 0;
        const skipped = typeof data.skipped === "number" ? data.skipped : 0;
        results.push({
          file: file.name,
          ok: res.ok,
          imported,
          total,
          skipped: skipped > 0 ? skipped : undefined,
          message: typeof data.message === "string" ? data.message : undefined,
        });
        if (res.ok) totalImported += imported;
      }
      const failed = results.filter((r) => !r.ok);
      if (failed.length > 0) {
        setStatus("error");
        setMessage(failed.length === results.length ? (failed[0].message ?? "Upload failed.") : `Some files failed. ${totalImported} rows imported from successful files.`);
        setResult({ results, totalImported });
        setFiles([]);
        setFileInputKey((k) => k + 1);
        return false;
      }
      setStatus("success");
      const totalSkipped = results.reduce((s, r) => s + (r.skipped ?? 0), 0);
      setMessage(
        results.length === 1
          ? `Imported ${totalImported} of ${results[0].total} rows from ${results[0].file}.${totalSkipped > 0 ? ` ${totalSkipped} duplicates skipped.` : ""}`
          : `Imported ${totalImported} rows from ${results.length} files.${totalSkipped > 0 ? ` ${totalSkipped} duplicates skipped.` : ""}`
      );
      setResult({ results, totalImported });
      setFiles([]);
      setFileInputKey((k) => k + 1);
      return true;
    } catch (err) {
      setStatus("error");
      setMessage(err instanceof Error ? err.message : "Upload failed.");
      return false;
    }
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    await runImport();
  }

  /** Import selected files (with duplicate check) then run analyze. If no files selected, just analyze. */
  async function handleImportAndAnalyze(e: React.FormEvent) {
    e.preventDefault();
    if (files.length > 0) {
      const ok = await runImport();
      if (!ok) return;
    }
    await handleAnalyze();
  }

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
      const ats = (data.autoTransfers as SuggestedAutoTransfer[]) ?? [];
      const bls = (data.bills as SuggestedBill[]) ?? [];
      setSuggestedPaychecks(pcs);
      setSuggestedAutoTransfers(ats);
      setSuggestedBills(bls);
      setSelectedPaycheckIndices(new Set(pcs.map((_, i) => i)));
      setSelectedBillIndices(new Set(bls.map((_, i) => i)));
      const freqByIndex: Record<number, string> = {};
      pcs.forEach((p, i) => {
        const f = p.frequency === "monthlyLastWorkingDay" || p.frequency === "monthly" ? p.frequency : "biweekly";
        freqByIndex[i] = f;
      });
      setPaycheckFrequencyByIndex(freqByIndex);
      const billOpts: Record<number, { section: "bills_account" | "checking_account" | "spanish_fork"; listType: "bills" | "subscriptions"; frequency: string }> = {};
      bls.forEach((b, i) => {
        const freq = b.frequency === "2weeks" || b.frequency === "yearly" ? b.frequency : "monthly";
        const g = b.suggestedGroup ?? { section: "checking_account" as const, listType: "bills" as const };
        billOpts[i] = { section: g.section, listType: g.listType, frequency: freq };
      });
      setBillOptionsByIndex(billOpts);
      setFillStatus("success");
      const n = data.statementsCount ?? 0;
      setFillMessage(`Found ${pcs.length} paychecks, ${ats.length} auto-transfers, and ${bls.length} bills (avg cost) from ${n} statements. Select/deselect then add.`);
    } catch (err) {
      setFillStatus("error");
      setFillMessage(err instanceof Error ? err.message : "Analyze failed.");
    }
  }

  async function loadTagSuggestions() {
    console.log("[Tagging wizard] Button clicked! Starting load...");
    setTagStatus("loading");
    setTagMessage("Loading...");
    try {
      console.log("[Tagging wizard] Fetching /api/statement-tags...");
      const res = await fetch("/api/statement-tags");
      console.log("[Tagging wizard] Response status:", res.status, res.ok);
      const data = (await res.json()) as { ok?: boolean; items?: TagSuggestion[]; message?: string };
      console.log("[Tagging wizard] Response data:", { ok: data.ok, itemsCount: data.items?.length ?? 0, message: data.message });
      if (!res.ok || data.ok === false) {
        setTagStatus("error");
        const msg = data.message ?? `Tagging wizard load failed (${res.status}).`;
        setTagMessage(msg);
        console.error("[Tagging wizard] Error:", msg, data);
        return;
      }
      const items = data.items ?? [];
      const subsectionsData = (data as { subsections?: { bills?: string[]; subscriptions?: string[] } }).subsections ?? {
        bills: [],
        subscriptions: [],
      };
      const billNamesData = (data as { billNames?: Record<string, string[]> }).billNames ?? {};
      setSubsections({
        bills: subsectionsData.bills ?? [],
        subscriptions: subsectionsData.subscriptions ?? [],
      });
      setBillNames(billNamesData);
      console.log("[Tagging wizard] Subsections loaded:", {
        bills: subsectionsData.bills ?? [],
        subscriptions: subsectionsData.subscriptions ?? [],
      });
      console.log("[Tagging wizard] Bill names by group:", billNamesData);
      console.log("[Tagging wizard] Items received:", items.length);
      console.log("[Tagging wizard] Subsections:", subsectionsData);
      if (items.length === 0) {
        setTagStatus("success");
        setTagMessage(data.message ?? "No statement rows found. Import some statements first.");
        return;
      }
      setTagSuggestions(items);
      const nextEdits: typeof tagEdits = {};
      items.forEach((t) => {
        nextEdits[t.id] = {
          targetType: t.suggestion.targetType,
          targetSection: t.suggestion.targetSection,
          targetName: t.suggestion.targetName, // This IS the subsection/name
        };
      });
      setTagEdits(nextEdits);
      setTagStatus("success");
      setTagMessage(`Loaded ${items.length} statement rows to tag.`);
      console.log("[Tagging wizard] Successfully loaded", items.length, "rows");
    } catch (err) {
      setTagStatus("error");
      const msg = err instanceof Error ? err.message : "Tagging wizard load failed.";
      setTagMessage(msg);
      console.error("[Tagging wizard] Exception:", err);
    }
  }

  async function applyTagEdits() {
    if (tagSuggestions.length === 0) {
      setTagMessage("No statement rows to tag.");
      return;
    }
    setTagStatus("saving");
    setTagMessage("");
    try {
      const items = tagSuggestions.map((t) => {
        const edit = tagEdits[t.id] ?? t.suggestion;
        return {
          statementId: t.id,
          targetType: edit.targetType,
          targetSection: edit.targetSection,
          targetName: edit.targetName, // This IS the subsection/name in PocketBase
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
        setTagMessage(data.message ?? "Saving tags failed.");
        console.error("Save tags error:", data);
        return;
      }
      setTagStatus("success");
      setTagMessage(data.message ?? `Saved ${data.rulesCreated ?? 0} rules and ${data.billsUpserted ?? 0} bills.`);
      // Optionally clear suggestions so you only see remaining next time.
      setTagSuggestions([]);
      setTagEdits({});
      router.refresh(); // Re-fetch so main page "paid this month" updates
    } catch (err) {
      setTagStatus("error");
      setTagMessage(err instanceof Error ? err.message : "Saving tags failed.");
      console.error("Save tags exception:", err);
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

  function toggleBill(i: number) {
    setSelectedBillIndices((prev) => {
      const next = new Set(prev);
      if (next.has(i)) next.delete(i);
      else next.add(i);
      return next;
    });
  }

  async function handleApplyPaychecks() {
    const selected = suggestedPaychecks
      .map((p, i) => (selectedPaycheckIndices.has(i) ? { ...p, frequency: paycheckFrequencyByIndex[i] ?? p.frequency } as const : null))
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
      } else setFillMessage((data.message as string) ?? "Create failed.");
    } catch (err) {
      setFillMessage(err instanceof Error ? err.message : "Create failed.");
    } finally {
      setApplying(false);
    }
  }

  async function handleApplyAutoTransfers() {
    setApplying(true);
    try {
      const res = await fetch("/api/fill-from-statements", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ createAutoTransfers: true }),
      });
      const data = (await res.json()) as Record<string, unknown>;
      if (res.ok) {
        setFillMessage((data.message as string) ?? `Created ${data.autoTransfersCreated ?? 0} auto-transfers.`);
        setSuggestedAutoTransfers([]);
      } else setFillMessage((data.message as string) ?? "Create failed.");
    } catch (err) {
      setFillMessage(err instanceof Error ? err.message : "Create failed.");
    } finally {
      setApplying(false);
    }
  }

  async function handleApplyBills() {
    const selected = suggestedBills
      .map((b, i) =>
        selectedBillIndices.has(i)
          ? {
              name: b.name,
              frequency: billOptionsByIndex[i]?.frequency ?? (b.frequency === "2weeks" || b.frequency === "yearly" ? b.frequency : "monthly"),
              amount: b.amount,
              lastDate: b.lastDate,
              section: billOptionsByIndex[i]?.section ?? "checking_account",
              listType: billOptionsByIndex[i]?.listType ?? "bills",
            }
          : null
      )
      .filter((x): x is NonNullable<typeof x> => x !== null);
    if (selected.length === 0) {
      setFillMessage("Select at least one bill to add.");
      return;
    }
    setApplying(true);
    try {
      const res = await fetch("/api/fill-from-statements", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ createBills: true, bills: selected }),
      });
      const data = (await res.json()) as Record<string, unknown>;
      if (res.ok) {
        setFillMessage((data.message as string) ?? `Created ${data.billsCreated ?? 0} bills.`);
        setSuggestedBills([]);
        setSelectedBillIndices(new Set());
      } else setFillMessage((data.message as string) ?? "Create failed.");
    } catch (err) {
      setFillMessage(err instanceof Error ? err.message : "Create failed.");
    } finally {
      setApplying(false);
    }
  }

  return (
    <main className="min-h-screen pb-safe bg-neutral-100 dark:bg-neutral-900 p-4">
      <div className="max-w-lg mx-auto space-y-6">
        <header>
          <h1 className="text-xl font-semibold text-neutral-900 dark:text-neutral-100">
            Statement uploads
          </h1>
          <p className="text-sm text-neutral-600 dark:text-neutral-400 mt-1">
            Upload Wells Fargo statement PDFs or any CSV. Stored in PocketBase in the <code className="bg-neutral-200 dark:bg-neutral-700 px-1 rounded">statements</code> collection.
          </p>
        </header>

        <div className="rounded-xl border border-neutral-200 dark:border-neutral-700 bg-white dark:bg-neutral-800/50 p-4 space-y-4">
          <p className="text-sm font-medium text-neutral-800 dark:text-neutral-200 mb-2">
            Wells Fargo PDF + CSV
          </p>
          <p className="text-xs text-neutral-500 dark:text-neutral-400">
            <strong>PDF:</strong> Tailored for Wells Fargo combined-statement PDFs. We use the “Transaction history” section, M/D dates, and first amount per line (deposits positive, withdrawals negative). Description is the payee/merchant name where we can detect it.<br />
            <strong>CSV:</strong> First row = headers (Date, Description or Memo/Payee, Amount; optional Balance, Category; or Debit/Credit columns). Wells Fargo &quot;Download activity&quot; CSV (no header: Date, Amount, *, blank, Description) is auto-detected for full history import.
          </p>
          <div className="mt-2 space-y-2">
            <p className="text-xs font-medium text-neutral-700 dark:text-neutral-300">
              Import and categorize flow
            </p>
            <div className="flex flex-wrap gap-2 mt-1">
              <button
                type="button"
                onClick={(e) => {
                  e.preventDefault();
                  setWizardStep(1);
                  setWizardOpen(true);
                }}
                className="rounded-lg bg-sky-600 text-white px-3 py-1.5 text-xs font-medium hover:bg-sky-500"
              >
                Start wizard (Upload → Paychecks → Add items)
              </button>
              <button
                type="button"
                onClick={(e) => {
                  e.preventDefault();
                  setWizardStep(3);
                  setWizardOpen(true);
                  if (tagSuggestions.length === 0) loadTagSuggestions();
                }}
                className="rounded-lg bg-neutral-200 dark:bg-neutral-700 text-neutral-800 dark:text-neutral-200 px-3 py-1.5 text-xs font-medium hover:bg-neutral-300 dark:hover:bg-neutral-600 disabled:opacity-50"
                disabled={tagStatus === "loading"}
              >
                {tagStatus === "loading" ? "Loading…" : "Open tagging wizard only"}
              </button>
            </div>
            {wizardOpen && (
              <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
                <div className="bg-white dark:bg-neutral-900 rounded-xl shadow-xl max-w-3xl w-[95vw] max-h-[80vh] flex flex-col">
                  <div className="flex items-center justify-between border-b border-neutral-200 dark:border-neutral-700 px-4 py-3">
                    <h2 className="text-sm font-semibold text-neutral-900 dark:text-neutral-100">
                      Step {wizardStep} of 3 — {wizardStep === 1 ? "Upload" : wizardStep === 2 ? "Paychecks" : "Add items"}
                    </h2>
                    <div className="flex items-center gap-2">
                      {wizardStep > 1 && (
                        <button
                          type="button"
                          onClick={() => setWizardStep((s) => (s - 1) as 1 | 2 | 3)}
                          className="rounded-lg px-3 py-1.5 text-xs font-medium text-neutral-600 dark:text-neutral-400 hover:bg-neutral-100 dark:hover:bg-neutral-800"
                        >
                          Back
                        </button>
                      )}
                      <button
                        type="button"
                        onClick={() => { setWizardOpen(false); setWizardStep(1); }}
                        className="rounded-lg p-1.5 text-neutral-500 hover:text-neutral-700 dark:hover:text-neutral-300 hover:bg-neutral-100 dark:hover:bg-neutral-800"
                        aria-label="Close"
                      >
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                        </svg>
                      </button>
                    </div>
                  </div>
                  {wizardStep === 1 && (
                    <div className="flex-1 overflow-y-auto p-4 space-y-4">
                      <p className="text-xs text-neutral-500 dark:text-neutral-400">
                        Upload statement CSV or PDF. Optionally run analyze with no files to use existing statements.
                      </p>
                      <form
                        onSubmit={async (e) => {
                          e.preventDefault();
                          if (files.length > 0) {
                            const ok = await runImport();
                            if (!ok) return;
                          }
                          await handleAnalyze();
                        }}
                        className="space-y-3"
                      >
                        <div>
                          <label htmlFor="wizard-file" className="block text-xs font-medium text-neutral-700 dark:text-neutral-300">CSV or PDF file(s)</label>
                          <input
                            key={fileInputKey}
                            id="wizard-file"
                            type="file"
                            accept=".csv,text/csv,application/csv,.pdf,application/pdf"
                            multiple
                            onChange={(e) => setFiles(Array.from(e.target.files ?? []))}
                            className="mt-1 block w-full text-sm text-neutral-600 dark:text-neutral-400 file:mr-2 file:rounded file:border-0 file:bg-neutral-200 file:px-3 file:py-1.5 file:text-xs dark:file:bg-neutral-700"
                          />
                          {files.length > 0 && <p className="mt-1 text-[11px] text-neutral-500">{files.length} file(s) selected</p>}
                        </div>
                        <div>
                          <label htmlFor="wizard-account" className="block text-xs font-medium text-neutral-700 dark:text-neutral-300">Account (optional)</label>
                          <input
                            id="wizard-account"
                            type="text"
                            value={account}
                            onChange={(e) => setAccount(e.target.value)}
                            placeholder="e.g. Checking"
                            className="mt-1 block w-full rounded border border-neutral-300 dark:border-neutral-600 bg-white dark:bg-neutral-800 px-2 py-1.5 text-sm"
                          />
                        </div>
                        <div className="flex gap-2">
                          <button
                            type="submit"
                            disabled={status === "loading" || fillStatus === "loading"}
                            className="rounded-lg bg-neutral-800 dark:bg-neutral-200 text-white dark:text-neutral-900 px-3 py-1.5 text-xs font-medium disabled:opacity-50"
                          >
                            {status === "loading" ? "Uploading…" : fillStatus === "loading" ? "Analyzing…" : "Import and analyze"}
                          </button>
                          <button
                            type="button"
                            onClick={() => { setWizardStep(2); if (suggestedPaychecks.length === 0) handleAnalyze(); }}
                            className="rounded-lg bg-sky-600 text-white px-3 py-1.5 text-xs font-medium hover:bg-sky-500"
                          >
                            Next: Paychecks
                          </button>
                        </div>
                      </form>
                    </div>
                  )}
                  {wizardStep === 2 && (
                    <div className="flex-1 overflow-y-auto p-4 space-y-4">
                      <p className="text-xs text-neutral-500 dark:text-neutral-400">
                        Add paychecks for this month from your statements. Run analyze if you haven’t yet.
                      </p>
                      <button
                        type="button"
                        onClick={() => handleAnalyze()}
                        disabled={fillStatus === "loading"}
                        className="rounded-lg bg-neutral-600 dark:bg-neutral-400 text-white dark:text-neutral-900 px-3 py-1.5 text-xs font-medium disabled:opacity-50"
                      >
                        {fillStatus === "loading" ? "Analyzing…" : "Analyze statements"}
                      </button>
                      {fillStatus === "success" && fillMessage && <p className="text-xs text-neutral-600 dark:text-neutral-300">{fillMessage}</p>}
                      {fillStatus === "error" && fillMessage && <p className="text-xs text-red-600 dark:text-red-400">{fillMessage}</p>}
                      {suggestedPaychecks.length > 0 && (
                        <>
                          <p className="text-xs font-medium text-neutral-700 dark:text-neutral-300">Suggested paychecks — select which to add</p>
                          <ul className="space-y-2 text-xs text-neutral-600 dark:text-neutral-400">
                            {suggestedPaychecks.map((p, i) => (
                              <li key={i} className="flex flex-wrap items-center gap-2">
                                <input
                                  type="checkbox"
                                  checked={selectedPaycheckIndices.has(i)}
                                  onChange={() => togglePaycheck(i)}
                                  className="mt-0.5 rounded border-neutral-400"
                                />
                                <span>{p.name} — ${p.amount.toFixed(2)} ({p.count}×, last {p.lastDate})</span>
                                <select
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
                          <div className="flex flex-wrap gap-2">
                            <button
                              type="button"
                              onClick={handleApplyPaychecks}
                              disabled={applying}
                              className="rounded-lg bg-emerald-600 text-white px-3 py-1.5 text-xs font-medium hover:bg-emerald-500 disabled:opacity-50"
                            >
                              {applying ? "Adding…" : `Add ${selectedPaycheckIndices.size} selected paychecks`}
                            </button>
                            <button
                              type="button"
                              onClick={() => { setWizardStep(3); if (tagSuggestions.length === 0) loadTagSuggestions(); }}
                              className="rounded-lg bg-sky-600 text-white px-3 py-1.5 text-xs font-medium hover:bg-sky-500"
                            >
                              Next: Add items
                            </button>
                          </div>
                        </>
                      )}
                      {suggestedPaychecks.length === 0 && fillStatus !== "loading" && (
                        <button
                          type="button"
                          onClick={() => { setWizardStep(3); if (tagSuggestions.length === 0) loadTagSuggestions(); }}
                          className="rounded-lg bg-sky-600 text-white px-3 py-1.5 text-xs font-medium hover:bg-sky-500"
                        >
                          Skip to Add items
                        </button>
                      )}
                    </div>
                  )}
                  {wizardStep === 3 && (
                    <>
                      <div className="px-4 py-2 border-b border-neutral-100 dark:border-neutral-800">
                        {(tagStatus === "error" || tagMessage) && (
                          <p className={`text-xs ${tagStatus === "error" ? "text-red-600 dark:text-red-400" : "text-neutral-600 dark:text-neutral-400"}`}>
                            {tagMessage}
                          </p>
                        )}
                        <p className="text-[11px] text-neutral-500 dark:text-neutral-400 mt-1">
                          Assign each row to a bill, variable expenses, or ignore. Use &quot;Add items to bills&quot; on the main page for the full modal with single selector.
                        </p>
                      </div>
                      <div className="flex-1 overflow-y-auto p-3 space-y-1.5">
                        {tagSuggestions.length === 0 && tagStatus !== "loading" && (
                          <p className="text-xs text-neutral-500 dark:text-neutral-400">
                            No rows loaded yet. Click &quot;Load rows&quot; or go Back and run analyze.
                          </p>
                        )}
                        {tagSuggestions.length > 0 && tagStatus !== "loading" && (
                          <button
                            type="button"
                            onClick={() => loadTagSuggestions()}
                            className="mb-2 rounded bg-neutral-200 dark:bg-neutral-700 px-2 py-1 text-[10px]"
                          >
                            Reload rows
                          </button>
                        )}
                        {tagSuggestions.map((row) => {
                      const edit = tagEdits[row.id] ?? row.suggestion;
                      const type = edit.targetType;
                      const sect = edit.targetSection;
                      const currentListType =
                        sect && sect !== "spanish_fork"
                          ? type === "subscription"
                            ? "subscriptions"
                            : "bills"
                          : null;
                      return (
                        <div
                          key={row.id}
                          className="flex flex-wrap items-start gap-2 p-1.5 rounded border border-neutral-200 dark:border-neutral-700 bg-neutral-50 dark:bg-neutral-900/50"
                        >
                          <div className="flex-shrink-0 text-[10px] text-neutral-500 dark:text-neutral-400 w-16">
                            {row.date.slice(5)}
                          </div>
                          <div
                            className="flex-1 min-w-[120px] max-w-[400px] text-[11px] text-neutral-800 dark:text-neutral-200 line-clamp-3 break-words"
                            title={row.description}
                          >
                            {row.description}
                          </div>
                          <div className="flex-shrink-0 text-[11px] font-medium text-right tabular-nums text-neutral-700 dark:text-neutral-300 w-16">
                            {row.amount.toFixed(2)}
                          </div>
                          <div className="flex-shrink-0 flex items-center gap-1 flex-wrap">
                            <select
                              className="text-[10px] rounded border border-neutral-300 dark:border-neutral-700 bg-white dark:bg-neutral-800 px-1.5 py-0.5 min-w-[80px]"
                              value={type}
                              onChange={(e) => {
                                const nextType = e.target.value as StatementTagTargetType;
                                setTagEdits((prev) => ({
                                  ...prev,
                                  [row.id]: {
                                    ...edit,
                                    targetType: nextType,
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
                                  className="text-[10px] rounded border border-neutral-300 dark:border-neutral-700 bg-white dark:bg-neutral-800 px-1.5 py-0.5 min-w-[100px]"
                                  value={sect ?? "checking_account"}
                                  onChange={(e) => {
                                    const nextSection = e.target.value as
                                      | "bills_account"
                                      | "checking_account"
                                      | "spanish_fork";
                                    setTagEdits((prev) => ({
                                      ...prev,
                                      [row.id]: {
                                        ...edit,
                                        targetSection: nextSection,
                                      },
                                    }));
                                  }}
                                >
                                  <option value="bills_account">Bills Account</option>
                                  <option value="checking_account">Checking</option>
                                  <option value="spanish_fork">Spanish Fork</option>
                                </select>
                                <select
                                  className="text-[10px] rounded border border-neutral-300 dark:border-neutral-700 bg-white dark:bg-neutral-800 px-1.5 py-0.5 min-w-[140px] max-w-[200px]"
                                  value={edit.targetName}
                                  onChange={(e) =>
                                    setTagEdits((prev) => ({
                                      ...prev,
                                      [row.id]: {
                                        ...edit,
                                        targetName: e.target.value,
                                      },
                                    }))
                                  }
                                >
                                  {(() => {
                                    const groupKey =
                                      sect === "spanish_fork"
                                        ? "spanish_fork"
                                        : `${sect}_${type === "subscription" ? "subscriptions" : "bills"}`;
                                    const namesForAccount = billNames[groupKey] ?? [];
                                    const typeSubsections =
                                      type === "subscription"
                                        ? subsections.subscriptions
                                        : subsections.bills;
                                    const options = namesForAccount.length > 0 ? namesForAccount : typeSubsections;
                                    const withCurrent = options.includes(edit.targetName)
                                      ? options
                                      : [edit.targetName, ...options];
                                    return withCurrent.map((name) => (
                                      <option key={name} value={name}>
                                        {displayBillName(name)}
                                      </option>
                                    ));
                                  })()}
                                </select>
                              </>
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                  <div className="border-t border-neutral-200 dark:border-neutral-800 px-4 py-2">
                    <button
                      type="button"
                      onClick={applyTagEdits}
                      className="w-full rounded-lg bg-emerald-600 text-white px-3 py-2 text-xs font-medium hover:bg-emerald-500 disabled:opacity-50"
                      disabled={tagStatus === "saving"}
                    >
                      {tagStatus === "saving"
                        ? "Saving…"
                        : `Save ${tagSuggestions.length} tags and update bills`}
                    </button>
                  </div>
                </>
                  )}
                </div>
              </div>
            )}
          </div>
        </div>

        <form onSubmit={handleImportAndAnalyze} className="space-y-4">
          <div>
            <label htmlFor="file" className="block text-sm font-medium text-neutral-700 dark:text-neutral-300">
              CSV or PDF file(s) — select one or many
            </label>
            <input
              key={fileInputKey}
              id="file"
              type="file"
              accept=".csv,text/csv,application/csv,.pdf,application/pdf"
              multiple
              onChange={(e) => setFiles(Array.from(e.target.files ?? []))}
              className="mt-1 block w-full text-sm text-neutral-600 dark:text-neutral-400 file:mr-4 file:rounded file:border-0 file:bg-neutral-200 file:px-4 file:py-2 file:text-sm file:font-medium file:text-neutral-800 dark:file:bg-neutral-700 dark:file:text-neutral-200"
            />
            {files.length > 0 && (
              <p className="mt-1 text-xs text-neutral-500 dark:text-neutral-400">
                {files.length} file{files.length !== 1 ? "s" : ""} selected: {files.map((f) => f.name).join(", ")}
              </p>
            )}
          </div>
          <div>
            <label htmlFor="account" className="block text-sm font-medium text-neutral-700 dark:text-neutral-300">
              Account (optional)
            </label>
            <input
              id="account"
              type="text"
              value={account}
              onChange={(e) => setAccount(e.target.value)}
              placeholder="e.g. Checking, Bills"
              className="mt-1 block w-full rounded-lg border border-neutral-300 dark:border-neutral-600 bg-white dark:bg-neutral-800 px-3 py-2 text-sm text-neutral-900 dark:text-neutral-100 placeholder:text-neutral-400"
            />
          </div>
          <button
            type="submit"
            disabled={status === "loading" || fillStatus === "loading"}
            className="w-full rounded-lg bg-neutral-800 dark:bg-neutral-200 text-white dark:text-neutral-900 px-4 py-2.5 text-sm font-medium hover:bg-neutral-700 dark:hover:bg-neutral-300 disabled:opacity-50"
          >
            {status === "loading" ? "Uploading…" : fillStatus === "loading" ? "Analyzing…" : "Import and analyze"}
          </button>
          <p className="text-xs text-neutral-500 dark:text-neutral-400">
            Imports CSV/PDF (duplicates skipped), then analyzes statements to suggest paychecks and bills. With no files selected, only analyzes existing statements.
          </p>
          <div className="mt-4 pt-4 border-t border-neutral-200 dark:border-neutral-700 space-y-2">
            <button
              type="button"
              onClick={handleResetTags}
              disabled={resetTagsStatus === "loading"}
              className="w-full rounded-lg border border-amber-300 dark:border-amber-700 bg-amber-50 dark:bg-amber-950/40 text-amber-800 dark:text-amber-200 px-4 py-2 text-sm font-medium hover:bg-amber-100 dark:hover:bg-amber-900/50 disabled:opacity-50"
            >
              {resetTagsStatus === "loading" ? "Resetting…" : "Reset all tags"}
            </button>
            <p className="text-[11px] text-neutral-500 dark:text-neutral-400">
              Clears all categorization rules (e.g. Dog Grooming, Walmart). Use &quot;Add items to bills&quot; on the main page to re-tag from scratch.
            </p>
            {resetTagsMessage && (
              <p
                className={`text-xs ${
                  resetTagsStatus === "error" ? "text-red-600 dark:text-red-400" : "text-neutral-600 dark:text-neutral-400"
                }`}
              >
                {resetTagsMessage}
              </p>
            )}
            <button
              type="button"
              onClick={handleDeleteAll}
              disabled={deleteAllStatus === "loading"}
              className="w-full rounded-lg border border-red-300 dark:border-red-800 bg-red-50 dark:bg-red-950/40 text-red-700 dark:text-red-300 px-4 py-2 text-sm font-medium hover:bg-red-100 dark:hover:bg-red-900/50 disabled:opacity-50"
            >
              {deleteAllStatus === "loading" ? "Deleting…" : "Delete all statements"}
            </button>
            {deleteAllMessage && (
              <p
                className={`text-xs ${
                  deleteAllStatus === "error" ? "text-red-600 dark:text-red-400" : "text-neutral-600 dark:text-neutral-400"
                }`}
              >
                {deleteAllMessage}
              </p>
            )}
          </div>
        </form>

        {status === "success" && (
          <div className="rounded-xl border border-emerald-200 dark:border-emerald-800 bg-emerald-50 dark:bg-emerald-950/30 p-4 text-sm text-emerald-800 dark:text-emerald-200">
            <p className="font-medium">{message}</p>
            {result && (
              <pre className="mt-2 overflow-auto rounded bg-white/50 dark:bg-black/20 p-2 text-xs">
                {JSON.stringify(result, null, 2)}
              </pre>
            )}
          </div>
        )}

        {status === "error" && (
          <div className="rounded-xl border border-red-200 dark:border-red-800 bg-red-50 dark:bg-red-950/30 p-4 text-sm text-red-800 dark:text-red-200">
            <p className="font-medium">{message}</p>
            {result && (
              <pre className="mt-2 overflow-auto rounded bg-white/50 dark:bg-black/20 p-2 text-xs">
                {JSON.stringify(result, null, 2)}
              </pre>
            )}
          </div>
        )}

        {/* Fill main page from statements */}
        <div id="fill-from-statements" className="rounded-xl border border-neutral-200 dark:border-neutral-700 bg-white dark:bg-neutral-800/50 p-4 scroll-mt-4">
          <p className="text-sm font-medium text-neutral-800 dark:text-neutral-200 mb-2">
            Fill main page from statements
          </p>
          <p className="text-xs text-neutral-500 dark:text-neutral-400 mb-1">
            Use <strong>Import and analyze</strong> above to upload then analyze, or use the button below to analyze existing statements only.
          </p>
          <p className="text-xs text-neutral-500 dark:text-neutral-400 mb-3">
            Use your imported statements to suggest <strong>expected paychecks</strong> (from deposits like Gusto Payroll, Direct Deposit) and <strong>auto-transfers</strong> (recurring transfers to/from Way2Save). Select or deselect paychecks and bills before adding—only selected items are added. Bills show average cost from statements. If you see “0 statements” but you’ve imported data, set <code className="bg-neutral-200 dark:bg-neutral-700 px-1 rounded">POCKETBASE_ADMIN_EMAIL</code> and <code className="bg-neutral-200 dark:bg-neutral-700 px-1 rounded">POCKETBASE_ADMIN_PASSWORD</code> in <code className="bg-neutral-200 dark:bg-neutral-700 px-1 rounded">.env.local</code> so the app can read statements when the List rule is restricted.
          </p>
          <button
            type="button"
            onClick={handleAnalyze}
            disabled={fillStatus === "loading"}
            className="w-full rounded-lg bg-neutral-600 dark:bg-neutral-400 text-white dark:text-neutral-900 px-4 py-2 text-sm font-medium hover:bg-neutral-500 dark:hover:bg-neutral-300 disabled:opacity-50"
          >
            {fillStatus === "loading" ? "Analyzing…" : "Analyze only (no new upload)"}
          </button>
          {fillStatus === "success" && fillMessage && (
            <p className="mt-2 text-xs text-neutral-600 dark:text-neutral-300">{fillMessage}</p>
          )}
          {fillStatus === "error" && fillMessage && (
            <p className="mt-2 text-xs text-red-600 dark:text-red-400">{fillMessage}</p>
          )}
          {suggestedPaychecks.length > 0 && (
            <div className="mt-4">
              <p className="text-xs font-medium text-neutral-700 dark:text-neutral-300 mb-2">Suggested paychecks (select which to add; set frequency)</p>
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
                    <label className="sr-only" htmlFor={`paycheck-freq-${i}`}>Frequency</label>
                    <select
                      id={`paycheck-freq-${i}`}
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
                className="mt-2 rounded-lg bg-emerald-600 text-white px-3 py-1.5 text-xs font-medium hover:bg-emerald-500 disabled:opacity-50"
              >
                {applying ? "Adding…" : `Add ${selectedPaycheckIndices.size} selected paychecks to main page`}
              </button>
            </div>
          )}
          {suggestedAutoTransfers.length > 0 && (
            <div className="mt-4">
              <p className="text-xs font-medium text-neutral-700 dark:text-neutral-300 mb-2">Suggested auto-transfers</p>
              <ul className="space-y-1 text-xs text-neutral-600 dark:text-neutral-400">
                {suggestedAutoTransfers.map((p, i) => (
                  <li key={i}>
                    {p.whatFor} — ${p.amount.toFixed(2)} ({p.frequency}, {p.count}× in statements)
                  </li>
                ))}
              </ul>
              <button
                type="button"
                onClick={handleApplyAutoTransfers}
                disabled={applying}
                className="mt-2 rounded-lg bg-emerald-600 text-white px-3 py-1.5 text-xs font-medium hover:bg-emerald-500 disabled:opacity-50"
              >
                {applying ? "Adding…" : "Add these auto-transfers to main page"}
              </button>
            </div>
          )}
          {suggestedBills.length > 0 && (() => {
            const sortedIndices = suggestedBills
              .map((_, i) => i)
              .sort((a, b) => {
                const optsA = billOptionsByIndex[a] ?? { section: "checking_account" as const, listType: "bills" as const };
                const optsB = billOptionsByIndex[b] ?? { section: "checking_account" as const, listType: "bills" as const };
                const keyA = groupKeyFrom(optsA.section, optsA.listType);
                const keyB = groupKeyFrom(optsB.section, optsB.listType);
                const orderA = MAIN_PAGE_GROUP_ORDER.indexOf(keyA as BillGroupKey);
                const orderB = MAIN_PAGE_GROUP_ORDER.indexOf(keyB as BillGroupKey);
                return (orderA < 0 ? 99 : orderA) - (orderB < 0 ? 99 : orderB);
              });
            let lastGroupKey: string | null = null;
            return (
              <div className="mt-4">
                <p className="text-xs font-medium text-neutral-700 dark:text-neutral-300 mb-2">Suggested bills — grouped like main page; change section or frequency if needed</p>
                <ul className="space-y-2 text-xs text-neutral-600 dark:text-neutral-400">
                  {sortedIndices.map((i) => {
                    const p = suggestedBills[i];
                    const opts = billOptionsByIndex[i] ?? { section: "checking_account" as const, listType: "bills" as const, frequency: p.frequency === "2weeks" || p.frequency === "yearly" ? p.frequency : "monthly" };
                    const groupKey = groupKeyFrom(opts.section, opts.listType) as BillGroupKey;
                    const showSectionHeader = lastGroupKey !== groupKey;
                    if (showSectionHeader) lastGroupKey = groupKey;
                    return (
                      <li key={i} className={showSectionHeader ? "pt-2 first:pt-0" : ""}>
                        {showSectionHeader && (
                          <p className="text-xs font-medium text-neutral-600 dark:text-neutral-500 mb-1">{GROUP_TITLES[groupKey]}</p>
                        )}
                        <div className="flex flex-wrap items-center gap-2">
                          <input
                            type="checkbox"
                            checked={selectedBillIndices.has(i)}
                            onChange={() => toggleBill(i)}
                            className="rounded border-neutral-400"
                          />
                          <span className="min-w-0">{p.name} — ${p.amount.toFixed(2)} avg ({p.count}×)</span>
                          <label className="sr-only" htmlFor={`bill-group-${i}`}>Section (main page)</label>
                          <select
                            id={`bill-group-${i}`}
                            value={groupKey}
                            onChange={(e) => {
                              const { section, listType } = groupKeyToSectionListType(e.target.value as BillGroupKey);
                              setBillOptionsByIndex((prev) => ({
                                ...prev,
                                [i]: { ...(prev[i] ?? { section: "checking_account", listType: "bills", frequency: "monthly" }), section, listType },
                              }));
                            }}
                            className="rounded border border-neutral-400 bg-white dark:bg-neutral-800 px-2 py-0.5"
                          >
                            {MAIN_PAGE_GROUP_ORDER.map((key) => (
                              <option key={key} value={key}>
                                {GROUP_TITLES[key]}
                              </option>
                            ))}
                          </select>
                          <label className="sr-only" htmlFor={`bill-freq-${i}`}>Frequency</label>
                          <select
                            id={`bill-freq-${i}`}
                            value={opts.frequency}
                            onChange={(e) =>
                              setBillOptionsByIndex((prev) => ({
                                ...prev,
                                [i]: { ...(prev[i] ?? { section: "checking_account", listType: "bills", frequency: "monthly" }), frequency: e.target.value },
                              }))
                            }
                            className="rounded border border-neutral-400 bg-white dark:bg-neutral-800 px-2 py-0.5"
                          >
                            <option value="monthly">Monthly</option>
                            <option value="2weeks">Every 2 weeks</option>
                            <option value="yearly">Yearly</option>
                          </select>
                        </div>
                      </li>
                    );
                  })}
                </ul>
                <button
                  type="button"
                  onClick={handleApplyBills}
                  disabled={applying}
                  className="mt-2 rounded-lg bg-emerald-600 text-white px-3 py-1.5 text-xs font-medium hover:bg-emerald-500 disabled:opacity-50"
                >
                  {applying ? "Adding…" : `Add ${selectedBillIndices.size} selected bills to main page`}
                </button>
              </div>
            );
          })()}
        </div>

        <p className="text-xs text-neutral-500 dark:text-neutral-400">
          <Link href="/" className="underline">
            ← Back to Neu Money Tracking
          </Link>
        </p>
      </div>
    </main>
  );
}
