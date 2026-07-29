"use client";

import { useRef, useState } from "react";

type UploadStatus = "idle" | "loading" | "success" | "error";
type CategorizeStatus = "idle" | "loading" | "success" | "error";

type UploadResult = {
  file: string;
  ok: boolean;
  imported: number;
  total: number;
  skipped: number;
  message?: string;
};

type AnalyticsImportStripProps = {
  onImported: () => Promise<void>;
  onRetryCategorize: () => Promise<void>;
  categorizeStatus: CategorizeStatus;
  categorizeMessage: string | null;
  categorizeError: string | null;
};

export function AnalyticsImportStrip({
  onImported,
  onRetryCategorize,
  categorizeStatus,
  categorizeMessage,
  categorizeError,
}: AnalyticsImportStripProps) {
  const [files, setFiles] = useState<File[]>([]);
  const [account, setAccount] = useState("");
  const [uploadStatus, setUploadStatus] = useState<UploadStatus>("idle");
  const [uploadMessage, setUploadMessage] = useState<string | null>(null);
  const [results, setResults] = useState<UploadResult[]>([]);
  const fileInputKey = useRef(0);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (files.length === 0) {
      setUploadStatus("error");
      setUploadMessage("Choose at least one CSV or PDF file.");
      return;
    }

    setUploadStatus("loading");
    setUploadMessage(`Uploading ${files.length} file${files.length === 1 ? "" : "s"}...`);
    setResults([]);

    const nextResults: UploadResult[] = [];
    const accountValue = account.trim();

    try {
      for (const file of files) {
        const formData = new FormData();
        formData.set("file", file);
        if (accountValue) formData.set("account", accountValue);

        const res = await fetch("/api/statements/import", {
          method: "POST",
          credentials: "include",
          body: formData,
        });
        const data = (await res.json()) as {
          imported?: number;
          total?: number;
          skipped?: number;
          message?: string;
        };

        nextResults.push({
          file: file.name,
          ok: res.ok,
          imported: typeof data.imported === "number" ? data.imported : 0,
          total: typeof data.total === "number" ? data.total : 0,
          skipped: typeof data.skipped === "number" ? data.skipped : 0,
          message: data.message,
        });
        setResults([...nextResults]);
      }

      const failed = nextResults.filter((result) => !result.ok);
      const totalImported = nextResults.reduce((sum, result) => sum + result.imported, 0);
      const totalSkipped = nextResults.reduce((sum, result) => sum + result.skipped, 0);

      if (failed.length > 0) {
        setUploadStatus("error");
        setUploadMessage(
          failed.length === nextResults.length
            ? (failed[0]?.message ?? "Upload failed.")
            : `Some files failed. ${totalImported} rows imported from successful files.`
        );
        if (totalImported === 0) return;
      } else {
        setUploadStatus("success");
        setUploadMessage(
          `Imported ${totalImported} rows from ${nextResults.length} file${nextResults.length === 1 ? "" : "s"}.` +
            (totalSkipped > 0 ? ` ${totalSkipped} duplicates skipped.` : "")
        );
      }

      setFiles([]);
      fileInputKey.current += 1;
      await onImported();
    } catch (err) {
      setUploadStatus("error");
      setUploadMessage(err instanceof Error ? err.message : "Upload failed.");
    }
  }

  const busy = uploadStatus === "loading" || categorizeStatus === "loading";

  return (
    <section className="rounded-2xl border border-neutral-200 dark:border-neutral-700 bg-white dark:bg-neutral-900 p-4 shadow-sm">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h2 className="text-sm font-semibold text-neutral-900 dark:text-neutral-100">
            Import statements
          </h2>
          <p className="mt-1 text-xs text-neutral-500 dark:text-neutral-400">
            Upload CSV or PDF files, then categorize new rows for analytics.
          </p>
        </div>
        <button
          type="button"
          onClick={() => void onRetryCategorize()}
          disabled={busy}
          className="rounded-lg border border-neutral-300 dark:border-neutral-600 px-3 py-2 text-xs font-medium text-neutral-700 dark:text-neutral-200 hover:bg-neutral-100 dark:hover:bg-neutral-800 disabled:opacity-50"
        >
          {categorizeStatus === "loading" ? "Categorizing..." : "Retry categorize"}
        </button>
      </div>

      <form onSubmit={handleSubmit} className="mt-4 grid gap-3 md:grid-cols-[1fr_180px_auto]">
        <div>
          <label htmlFor="analytics-upload-file" className="block text-xs font-medium text-neutral-600 dark:text-neutral-400 mb-1">
            File(s)
          </label>
          <input
            key={fileInputKey.current}
            id="analytics-upload-file"
            type="file"
            accept=".csv,text/csv,application/csv,.pdf,application/pdf"
            multiple
            onChange={(e) => setFiles(Array.from(e.target.files ?? []))}
            className="block w-full text-sm text-neutral-600 dark:text-neutral-400 file:mr-3 file:rounded file:border-0 file:bg-neutral-200 file:px-3 file:py-2 file:text-sm file:font-medium file:text-neutral-800 dark:file:bg-neutral-700 dark:file:text-neutral-200"
          />
          {files.length > 0 && (
            <p className="mt-1 text-xs text-neutral-500 dark:text-neutral-400">
              {files.length} selected: {files.map((file) => file.name).join(", ")}
            </p>
          )}
        </div>

        <div>
          <label htmlFor="analytics-upload-account" className="block text-xs font-medium text-neutral-600 dark:text-neutral-400 mb-1">
            Account
          </label>
          <input
            id="analytics-upload-account"
            type="text"
            value={account}
            onChange={(e) => setAccount(e.target.value)}
            placeholder="Optional"
            className="w-full rounded-lg border border-neutral-300 dark:border-neutral-600 bg-white dark:bg-neutral-800 px-3 py-2 text-sm text-neutral-900 dark:text-neutral-100 placeholder:text-neutral-400"
          />
        </div>

        <button
          type="submit"
          disabled={busy || files.length === 0}
          className="self-end rounded-lg bg-emerald-600 px-4 py-2.5 text-sm font-medium text-white hover:bg-emerald-500 disabled:opacity-50"
        >
          {uploadStatus === "loading" ? "Uploading..." : "Upload"}
        </button>
      </form>

      {(uploadMessage || categorizeMessage || categorizeError) && (
        <div className="mt-3 space-y-1 text-sm">
          {uploadMessage && (
            <p className={uploadStatus === "error" ? "text-red-600 dark:text-red-400" : "text-neutral-600 dark:text-neutral-300"}>
              {uploadMessage}
            </p>
          )}
          {categorizeMessage && (
            <p className="text-neutral-600 dark:text-neutral-300">{categorizeMessage}</p>
          )}
          {categorizeError && (
            <p className="text-red-600 dark:text-red-400">{categorizeError}</p>
          )}
        </div>
      )}

      {results.length > 0 && (
        <div className="mt-3 divide-y divide-neutral-200 overflow-hidden rounded-lg border border-neutral-200 text-xs dark:divide-neutral-700 dark:border-neutral-700">
          {results.map((result) => (
            <div key={result.file} className="flex flex-wrap items-center justify-between gap-2 px-3 py-2">
              <span className="font-medium text-neutral-700 dark:text-neutral-200">{result.file}</span>
              <span className={result.ok ? "text-neutral-500 dark:text-neutral-400" : "text-red-600 dark:text-red-400"}>
                {result.imported}/{result.total} imported
                {result.skipped ? `, ${result.skipped} skipped` : ""}
              </span>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}
