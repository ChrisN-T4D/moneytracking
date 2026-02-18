"use client";

import { useState, useEffect } from "react";

export default function DebugPaychecksPage() {
  const [data, setData] = useState<unknown>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/debug-paychecks")
      .then((res) => res.json())
      .then(setData)
      .catch((err) => setError(err?.message ?? String(err)));
  }, []);

  if (error) return <pre className="p-4 text-red-600">{error}</pre>;
  if (data == null) return <p className="p-4">Loading…</p>;

  return (
    <main className="min-h-screen bg-neutral-100 dark:bg-neutral-900 p-4">
      <h1 className="text-lg font-semibold mb-2">Debug: Paychecks API</h1>
      <p className="text-sm text-neutral-600 dark:text-neutral-400 mb-4">
        Copy the JSON below and paste it in chat so we can fix &quot;Paid this month&quot;.
      </p>
      <pre className="bg-white dark:bg-neutral-800 p-4 rounded-lg overflow-auto text-xs whitespace-pre-wrap border border-neutral-200 dark:border-neutral-700">
        {JSON.stringify(data, null, 2)}
      </pre>
    </main>
  );
}
