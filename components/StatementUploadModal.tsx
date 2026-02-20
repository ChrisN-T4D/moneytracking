"use client";

import { useState, useRef } from "react";
import { useRouter } from "next/navigation";

interface StatementUploadModalProps {
  open?: boolean;
  onClose?: () => void;
}

export function StatementUploadModal({ open = false, onClose }: StatementUploadModalProps) {
  const router = useRouter();
  const [files, setFiles] = useState<File[]>([]);
  const [account, setAccount] = useState("");
  const [status, setStatus] = useState<"idle" | "loading" | "success" | "error">("idle");
  const [message, setMessage] = useState("");
  const [result, setResult] = useState<Record<string, unknown> | null>(null);
  const fileInputKey = useRef(0);

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
    const results: Array<{ file: string; ok: boolean; imported: number; total: number; skipped?: number; message?: string }> = [];
    let totalImported = 0;
    let totalSkipped = 0;
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
        if (res.ok) {
          totalImported += imported;
          totalSkipped += skipped;
        }
      }
      const failed = results.filter((r) => !r.ok);
      if (failed.length > 0) {
        setStatus("error");
        setMessage(
          failed.length === results.length
            ? (failed[0].message ?? "Upload failed.")
            : `Some files failed. ${totalImported} rows imported from successful files.`
        );
      } else {
        setStatus("success");
        setMessage(
          results.length === 1
            ? `Imported ${totalImported} of ${results[0].total} rows from ${results[0].file}.${totalSkipped > 0 ? ` ${totalSkipped} duplicates skipped.` : ""}`
            : `Imported ${totalImported} rows from ${results.length} files.${totalSkipped > 0 ? ` ${totalSkipped} duplicates skipped.` : ""}`
        );
      }
      setResult({ results, totalImported, totalSkipped });
      setFiles([]);
      fileInputKey.current += 1;
    } catch (err) {
      setStatus("error");
      setMessage(err instanceof Error ? err.message : "Upload failed.");
    }
  }

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-[100] flex min-h-[100dvh] items-center justify-center bg-neutral-950/70 p-4 backdrop-blur-sm"
      onClick={() => onClose?.()}
      role="dialog"
      aria-modal="true"
      aria-labelledby="statement-upload-title"
    >
      <div
        className="w-full max-w-md rounded-2xl border border-neutral-200 dark:border-neutral-700 bg-white dark:bg-neutral-900 shadow-2xl overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex shrink-0 items-center justify-between border-b border-neutral-200 dark:border-neutral-700 px-4 py-3">
          <h2 id="statement-upload-title" className="text-sm font-semibold text-neutral-900 dark:text-neutral-100">
            Statement upload
          </h2>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg p-1.5 text-neutral-500 hover:text-neutral-700 dark:hover:text-neutral-300 hover:bg-neutral-100 dark:hover:bg-neutral-800"
            aria-label="Close"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>
        <form onSubmit={handleSubmit} className="p-4 space-y-4">
          <p className="text-xs text-neutral-500 dark:text-neutral-400">
            CSV or PDF. Duplicates (same date, description, amount) are skipped. Wells Fargo CSV/PDF supported.
          </p>
          <div>
            <label htmlFor="upload-file" className="block text-xs font-medium text-neutral-600 dark:text-neutral-400 mb-1">
              File(s)
            </label>
            <input
              key={fileInputKey.current}
              id="upload-file"
              type="file"
              accept=".csv,text/csv,application/csv,.pdf,application/pdf"
              multiple
              onChange={(e) => setFiles(Array.from(e.target.files ?? []))}
              className="block w-full text-sm text-neutral-600 dark:text-neutral-400 file:mr-4 file:rounded file:border-0 file:bg-neutral-200 file:px-4 file:py-2 file:text-sm file:font-medium file:text-neutral-800 dark:file:bg-neutral-700 dark:file:text-neutral-200"
            />
            {files.length > 0 && (
              <p className="mt-1 text-xs text-neutral-500 dark:text-neutral-400">
                {files.length} file{files.length !== 1 ? "s" : ""}: {files.map((f) => f.name).join(", ")}
              </p>
            )}
          </div>
          <div>
            <label htmlFor="upload-account" className="block text-xs font-medium text-neutral-600 dark:text-neutral-400 mb-1">
              Account (optional)
            </label>
            <input
              id="upload-account"
              type="text"
              value={account}
              onChange={(e) => setAccount(e.target.value)}
              placeholder="e.g. Checking, Bills"
              className="w-full rounded-lg border border-neutral-300 dark:border-neutral-600 bg-white dark:bg-neutral-800 px-3 py-2 text-sm text-neutral-900 dark:text-neutral-100 placeholder:text-neutral-400"
            />
          </div>
          {(status === "error" || message) && (
            <p
              className={`text-sm ${
                status === "error" ? "text-red-600 dark:text-red-400" : "text-neutral-600 dark:text-neutral-300"
              }`}
            >
              {message}
            </p>
          )}
          <div className="flex gap-2">
            <button
              type="submit"
              disabled={status === "loading" || files.length === 0}
              className="flex-1 rounded-lg bg-emerald-600 text-white px-4 py-2.5 text-sm font-medium hover:bg-emerald-500 disabled:opacity-50"
            >
              {status === "loading" ? "Uploading…" : files.length > 0 ? `Upload ${files.length} file(s)` : "Choose files"}
            </button>
            <button
              type="button"
              onClick={() => {
                setStatus("idle");
                setMessage("");
                setResult(null);
                onClose?.();
                router.push("/statements");
              }}
              className="rounded-lg border border-neutral-300 dark:border-neutral-600 bg-white dark:bg-neutral-800 px-4 py-2.5 text-sm font-medium text-neutral-700 dark:text-neutral-300 hover:bg-neutral-100 dark:hover:bg-neutral-700"
            >
              Open statements page
            </button>
          </div>
        </form>
        {status === "success" && result && (
          <div className="px-4 pb-4">
            <pre className="overflow-auto rounded-lg bg-neutral-100 dark:bg-neutral-800 p-2 text-xs">
              {JSON.stringify(result, null, 2)}
            </pre>
          </div>
        )}
      </div>
    </div>
  );
}
