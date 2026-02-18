"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import type { StatementTagTargetType } from "@/lib/types";

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

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (files.length === 0) {
      setStatus("error");
      setMessage("Choose at least one CSV or PDF file.");
      return;
    }
    setStatus("loading");
    setMessage("");
    setResult(null);
    const accountVal = account.trim();
    const results: Array<{ file: string; ok: boolean; imported: number; total: number; message?: string }> = [];
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
        results.push({
          file: file.name,
          ok: res.ok,
          imported,
          total,
          message: typeof data.message === "string" ? data.message : undefined,
        });
        if (res.ok) totalImported += imported;
      }
      const failed = results.filter((r) => !r.ok);
      if (failed.length > 0) {
        setStatus("error");
        setMessage(failed.length === results.length ? (failed[0].message ?? "Upload failed.") : `Some files failed. ${totalImported} rows imported from successful files.`);
      } else {
        setStatus("success");
        setMessage(
          results.length === 1
            ? `Imported ${totalImported} of ${results[0].total} rows from ${results[0].file}.`
            : `Imported ${totalImported} rows from ${results.length} files.`
        );
      }
      setResult({ results, totalImported });
      setFiles([]);
      setFileInputKey((k) => k + 1);
    } catch (err) {
      setStatus("error");
      setMessage(err instanceof Error ? err.message : "Upload failed.");
    }
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
      const subsectionsData = (data.subsections as { bills?: string[]; subscriptions?: string[] }) ?? {
        bills: [],
        subscriptions: [],
      };
      const billNamesData = (data.billNames as Record<string, string[]>) ?? {};
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
            <strong>CSV:</strong> First row = headers (Date, Description or Memo/Payee, Amount; optional Balance, Category; or Debit/Credit columns).
          </p>
          <div className="mt-2 space-y-2">
            <p className="text-xs font-medium text-neutral-700 dark:text-neutral-300">
              Tagging wizard (teach the app how to classify statement rows)
            </p>
            {(tagStatus === "error" || tagMessage) && (
              <p
                className={`text-xs ${
                  tagStatus === "error"
                    ? "text-red-600 dark:text-red-400"
                    : "text-neutral-600 dark:text-neutral-400"
                }`}
              >
                {tagMessage}
              </p>
            )}
            <button
              type="button"
              onClick={(e) => {
                e.preventDefault();
                setWizardOpen(true);
                loadTagSuggestions();
              }}
              className="rounded-lg bg-sky-600 text-white px-3 py-1.5 text-xs font-medium hover:bg-sky-500 disabled:opacity-50"
              disabled={tagStatus === "loading"}
            >
              {tagStatus === "loading" ? "Loading rows…" : "Open tagging wizard"}
            </button>
            {wizardOpen && (
              <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
                <div className="bg-white dark:bg-neutral-900 rounded-xl shadow-xl max-w-3xl w-[95vw] max-h-[80vh] flex flex-col">
                  <div className="flex items-center justify-between border-b border-neutral-200 dark:border-neutral-700 px-4 py-3">
                    <h2 className="text-sm font-semibold text-neutral-900 dark:text-neutral-100">
                      Tag statement rows
                    </h2>
                    <button
                      type="button"
                      onClick={() => setWizardOpen(false)}
                      className="rounded-lg p-1.5 text-neutral-500 hover:text-neutral-700 dark:hover:text-neutral-300 hover:bg-neutral-100 dark:hover:bg-neutral-800"
                      aria-label="Close"
                    >
                      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                      </svg>
                    </button>
                  </div>
                  <div className="px-4 py-2 border-b border-neutral-100 dark:border-neutral-800">
                    {(tagStatus === "error" || tagMessage) && (
                      <p
                        className={`text-xs ${
                          tagStatus === "error"
                            ? "text-red-600 dark:text-red-400"
                            : "text-neutral-600 dark:text-neutral-400"
                        }`}
                      >
                        {tagMessage}
                      </p>
                    )}
                    <p className="text-[11px] text-neutral-500 dark:text-neutral-400 mt-1">
                      Rows are loaded from your <code className="px-1 rounded bg-neutral-200 dark:bg-neutral-700">statements</code> collection.
                      Adjust type / section / bill name, then save.
                    </p>
                  </div>
                  <div className="flex-1 overflow-y-auto p-3 space-y-1.5">
                    {tagSuggestions.length === 0 && tagStatus !== "loading" && (
                      <p className="text-xs text-neutral-500 dark:text-neutral-400">
                        No rows loaded yet. Click &quot;Open tagging wizard&quot; again if needed.
                      </p>
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
                          <div className="flex-1 min-w-[120px] text-[11px] text-neutral-800 dark:text-neutral-200 truncate">
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
                                    const fromBillNames = Array.from(
                                      new Set(Object.values(billNames).flat() as string[])
                                    );
                                    const typeSubsections =
                                      type === "subscription"
                                        ? subsections.subscriptions
                                        : subsections.bills;
                                    const combined = Array.from(
                                      new Set([...fromBillNames, ...typeSubsections])
                                    );
                                    const options =
                                      combined.length > 0 ? combined : [edit.targetName];
                                    return options.map((name) => (
                                      <option key={name} value={name}>
                                        {name}
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
                </div>
              </div>
            )}
          </div>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
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
            disabled={status === "loading" || files.length === 0}
            className="w-full rounded-lg bg-neutral-800 dark:bg-neutral-200 text-white dark:text-neutral-900 px-4 py-2.5 text-sm font-medium hover:bg-neutral-700 dark:hover:bg-neutral-300 disabled:opacity-50"
          >
            {status === "loading" ? "Uploading…" : files.length > 1 ? `Upload ${files.length} files` : "Upload"}
          </button>
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
          <p className="text-xs text-neutral-500 dark:text-neutral-400 mb-3">
            Use your imported statements to suggest <strong>expected paychecks</strong> (from deposits like Gusto Payroll, Direct Deposit) and <strong>auto-transfers</strong> (recurring transfers to/from Way2Save). Select or deselect paychecks and bills before adding—only selected items are added. Bills show average cost from statements. If you see “0 statements” but you’ve imported data, set <code className="bg-neutral-200 dark:bg-neutral-700 px-1 rounded">POCKETBASE_ADMIN_EMAIL</code> and <code className="bg-neutral-200 dark:bg-neutral-700 px-1 rounded">POCKETBASE_ADMIN_PASSWORD</code> in <code className="bg-neutral-200 dark:bg-neutral-700 px-1 rounded">.env.local</code> so the app can read statements when the List rule is restricted.
          </p>
          <button
            type="button"
            onClick={handleAnalyze}
            disabled={fillStatus === "loading"}
            className="w-full rounded-lg bg-neutral-700 dark:bg-neutral-300 text-white dark:text-neutral-900 px-4 py-2.5 text-sm font-medium hover:bg-neutral-600 dark:hover:bg-neutral-200 disabled:opacity-50"
          >
            {fillStatus === "loading" ? "Analyzing…" : "Analyze statements"}
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
