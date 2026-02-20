"use client";

import { useState } from "react";
import Link from "next/link";

export default function SetupPage() {
  const [secret, setSecret] = useState("");
  const [seedOnly, setSeedOnly] = useState(false);
  const [status, setStatus] = useState<"idle" | "loading" | "success" | "error">("idle");
  const [message, setMessage] = useState("");
  const [details, setDetails] = useState<Record<string, unknown> | null>(null);
  const [probeStatus, setProbeStatus] = useState<"idle" | "loading" | "done">("idle");
  const [probeResult, setProbeResult] = useState<Record<string, unknown> | null>(null);
  const [noAdminStatus, setNoAdminStatus] = useState<"idle" | "loading" | "success" | "error">("idle");
  const [noAdminMessage, setNoAdminMessage] = useState("");
  const [noAdminDetails, setNoAdminDetails] = useState<Record<string, unknown> | null>(null);
  const [resetBillsStatus, setResetBillsStatus] = useState<"idle" | "loading" | "success" | "error">("idle");
  const [resetBillsMessage, setResetBillsMessage] = useState("");

  async function handleProbe() {
    setProbeStatus("loading");
    setProbeResult(null);
    try {
      const res = await fetch("/api/pocketbase-probe");
      const data = (await res.json()) as Record<string, unknown>;
      setProbeResult({ status: res.status, ...data });
    } catch (err) {
      setProbeResult({
        ok: false,
        message: "Request failed.",
        error: err instanceof Error ? err.message : String(err),
      });
    } finally {
      setProbeStatus("done");
    }
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setStatus("loading");
    setMessage("");
    setDetails(null);
    try {
      const res = await fetch("/api/setup-pocketbase", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ secret: secret || undefined, seedOnly }),
      });
      const data = (await res.json()) as {
        ok?: boolean;
        message?: string;
        error?: string;
        createdCollections?: string[];
        seeded?: Record<string, number>;
      };
      if (!res.ok) {
        setStatus("error");
        setMessage(data.message ?? data.error ?? `Error ${res.status}`);
        setDetails(data);
        return;
      }
      setStatus("success");
      setMessage(data.message ?? "Done.");
      setDetails({
        createdCollections: data.createdCollections,
        seeded: data.seeded,
      });
    } catch (err) {
      setStatus("error");
      setMessage(err instanceof Error ? err.message : "Request failed.");
    }
  }

  async function handleSeedNoAdmin() {
    setNoAdminStatus("loading");
    setNoAdminMessage("");
    setNoAdminDetails(null);
    try {
      const res = await fetch("/api/setup-pocketbase", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ noAdmin: true, secret: secret || undefined }),
      });
      const data = (await res.json()) as Record<string, unknown>;
      if (!res.ok) {
        setNoAdminStatus("error");
        setNoAdminMessage((data.message as string) ?? (data.error as string) ?? `Error ${res.status}`);
        setNoAdminDetails(data);
        return;
      }
      setNoAdminStatus("success");
      setNoAdminMessage((data.message as string) ?? "Seeded.");
      setNoAdminDetails(data);
    } catch (err) {
      setNoAdminStatus("error");
      setNoAdminMessage(err instanceof Error ? err.message : "Request failed.");
    }
  }

  async function handleResetBills() {
    if (!confirm("Delete all bills and subscriptions from PocketBase? You can re-enter them (or run Seed only to repopulate from defaults). Continue?")) return;
    setResetBillsStatus("loading");
    setResetBillsMessage("");
    try {
      const res = await fetch("/api/bills/reset", { method: "DELETE" });
      const data = (await res.json()) as { ok?: boolean; message?: string };
      if (!res.ok) {
        setResetBillsStatus("error");
        setResetBillsMessage(data.message ?? `Error ${res.status}`);
        return;
      }
      setResetBillsStatus("success");
      setResetBillsMessage(data.message ?? `Deleted. Refresh the main page.`);
    } catch (err) {
      setResetBillsStatus("error");
      setResetBillsMessage(err instanceof Error ? err.message : "Request failed.");
    }
  }

  return (
    <main className="min-h-screen pb-safe bg-neutral-100 dark:bg-neutral-900 p-4">
      <div className="max-w-md mx-auto space-y-6">
        <header>
          <h1 className="text-xl font-semibold text-neutral-900 dark:text-neutral-100">
            PocketBase setup
          </h1>
          <p className="text-sm text-neutral-600 dark:text-neutral-400 mt-1">
            Create collections and seed them with default data so you don’t have to add everything in PocketBase.
          </p>
        </header>

        <div className="rounded-xl border border-amber-200 dark:border-amber-800 bg-amber-50 dark:bg-amber-950/30 p-4 text-sm text-amber-800 dark:text-amber-200">
          <p className="font-medium">Required in .env.local:</p>
          <ul className="mt-1 list-disc list-inside space-y-0.5 text-amber-700 dark:text-amber-300">
            <li><code>NEXT_PUBLIC_POCKETBASE_URL</code></li>
            <li><code>POCKETBASE_ADMIN_EMAIL</code></li>
            <li><code>POCKETBASE_ADMIN_PASSWORD</code></li>
          </ul>
          <p className="mt-2">
            Optional: set <code>SEED_SECRET</code> and enter it below to protect this action.
          </p>
        </div>

        <div className="rounded-xl border border-neutral-200 dark:border-neutral-700 bg-white dark:bg-neutral-800/50 p-4">
          <p className="text-sm font-medium text-neutral-800 dark:text-neutral-200 mb-2">
            Check PocketBase connection
          </p>
          <p className="text-xs text-neutral-500 dark:text-neutral-400 mb-2">
            Verifies that your PocketBase API is reachable (tries /api/health on your base URL).
          </p>
          <button
            type="button"
            onClick={handleProbe}
            disabled={probeStatus === "loading"}
            className="rounded-lg border border-neutral-300 dark:border-neutral-600 px-3 py-2 text-sm font-medium text-neutral-700 dark:text-neutral-300 hover:bg-neutral-100 dark:hover:bg-neutral-700 disabled:opacity-50"
          >
            {probeStatus === "loading" ? "Checking…" : "Check connection"}
          </button>
          {probeResult && (
            <pre className="mt-3 overflow-auto rounded bg-neutral-100 dark:bg-neutral-900 p-3 text-xs text-left">
              {JSON.stringify(probeResult, null, 2)}
            </pre>
          )}
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label htmlFor="secret" className="block text-sm font-medium text-neutral-700 dark:text-neutral-300">
              Setup key (optional)
            </label>
            <input
              id="secret"
              type="password"
              value={secret}
              onChange={(e) => setSecret(e.target.value)}
              placeholder="Only if SEED_SECRET is set"
              className="mt-1 block w-full rounded-lg border border-neutral-300 dark:border-neutral-600 bg-white dark:bg-neutral-800 px-3 py-2 text-sm text-neutral-900 dark:text-neutral-100 placeholder:text-neutral-400"
              autoComplete="off"
            />
          </div>

          <p className="text-sm font-medium text-neutral-800 dark:text-neutral-200">
            What do you want to run?
          </p>
          <label className="flex items-center gap-2 text-sm text-neutral-700 dark:text-neutral-300">
            <input
              type="radio"
              name="mode"
              checked={!seedOnly}
              onChange={() => setSeedOnly(false)}
              className="rounded-full border-neutral-400"
            />
            Create collections and seed data (first-time setup)
          </label>
          <label className="flex items-center gap-2 text-sm text-neutral-700 dark:text-neutral-300">
            <input
              type="radio"
              name="mode"
              checked={seedOnly}
              onChange={() => setSeedOnly(true)}
              className="rounded-full border-neutral-400"
            />
            <strong>Seed only</strong> — collections already exist; fill them with default data (uses your admin/superuser token)
          </label>
          <p className="text-xs text-neutral-500 dark:text-neutral-400">
            If your PocketBase Create rule is &quot;only superusers&quot;, use <strong>Seed only</strong> with your admin email/password in .env.local.
          </p>
          <button
            type="submit"
            disabled={status === "loading"}
            className="w-full rounded-lg bg-neutral-800 dark:bg-neutral-200 text-white dark:text-neutral-900 px-4 py-2.5 text-sm font-medium hover:bg-neutral-700 dark:hover:bg-neutral-300 disabled:opacity-50"
          >
            {status === "loading" ? "Running…" : seedOnly ? "Seed data only" : "Create collections and seed data"}
          </button>
        </form>

        <div className="rounded-xl border border-sky-200 dark:border-sky-800 bg-sky-50 dark:bg-sky-950/30 p-4 text-sm text-sky-800 dark:text-sky-200">
          <p className="font-medium">Seed without admin (only if Create rule allows it)</p>
          <p className="mt-1 text-sky-700 dark:text-sky-300">
            If your collections have <strong>Create = only superusers</strong>, do <em>not</em> use the button below. Use the main form above with admin email/password and &quot;Seed only&quot; checked instead. Use the button below only when Create rule allows public/anonymous create.
          </p>
          <ol className="mt-2 list-decimal list-inside space-y-1 text-sky-700 dark:text-sky-300">
            <li>In PocketBase admin, create the collections manually (see <code className="bg-sky-100 dark:bg-sky-900/50 px-1 rounded">POCKETBASE.md</code>).</li>
            <li>If Create = only superusers: use main form + Seed only above. Otherwise set Create to allow, then click below.</li>
          </ol>
          <button
            type="button"
            onClick={handleSeedNoAdmin}
            disabled={noAdminStatus === "loading"}
            className="mt-3 rounded-lg bg-sky-700 text-white px-4 py-2 text-sm font-medium hover:bg-sky-600 disabled:opacity-50"
          >
            {noAdminStatus === "loading" ? "Seeding…" : "Seed data without admin"}
          </button>
          {noAdminStatus === "success" && (
            <div className="mt-3 text-emerald-700 dark:text-emerald-300">
              <p>{noAdminMessage}</p>
              {noAdminDetails && (
                <pre className="mt-1 overflow-auto rounded bg-white/50 dark:bg-black/20 p-2 text-xs">
                  {JSON.stringify(noAdminDetails, null, 2)}
                </pre>
              )}
            </div>
          )}
          {noAdminStatus === "error" && (
            <div className="mt-3 text-red-700 dark:text-red-300">
              <p>{noAdminMessage}</p>
              {noAdminDetails && (
                <pre className="mt-1 overflow-auto rounded bg-white/50 dark:bg-black/20 p-2 text-xs">
                  {JSON.stringify(noAdminDetails, null, 2)}
                </pre>
              )}
            </div>
          )}
        </div>

        <div className="rounded-xl border border-amber-200 dark:border-amber-800 bg-amber-50 dark:bg-amber-950/30 p-4 text-sm text-amber-800 dark:text-amber-200">
          <p className="font-medium">Reset bills (remove duplicates)</p>
          <p className="mt-1 text-amber-700 dark:text-amber-300">
            Delete all records in the <strong>bills</strong> collection so you can re-enter without duplicates. Then run <strong>Seed only</strong> above to repopulate from defaults, or add bills manually in PocketBase / via &quot;Add items to bills.&quot;
          </p>
          <button
            type="button"
            onClick={handleResetBills}
            disabled={resetBillsStatus === "loading"}
            className="mt-3 rounded-lg border border-amber-400 dark:border-amber-600 bg-amber-200 dark:bg-amber-900/50 px-4 py-2 text-sm font-medium text-amber-900 dark:text-amber-100 hover:bg-amber-300 dark:hover:bg-amber-800/50 disabled:opacity-50"
          >
            {resetBillsStatus === "loading" ? "Deleting…" : "Delete all bills"}
          </button>
          {resetBillsStatus === "success" && (
            <p className="mt-3 text-emerald-700 dark:text-emerald-300">{resetBillsMessage}</p>
          )}
          {resetBillsStatus === "error" && (
            <p className="mt-3 text-red-700 dark:text-red-300">{resetBillsMessage}</p>
          )}
        </div>

        {status === "success" && (
          <div className="rounded-xl border border-emerald-200 dark:border-emerald-800 bg-emerald-50 dark:bg-emerald-950/30 p-4 text-sm text-emerald-800 dark:text-emerald-200">
            <p className="font-medium">{message}</p>
            {details && (
              <pre className="mt-2 overflow-auto rounded bg-white/50 dark:bg-black/20 p-2 text-xs">
                {JSON.stringify(details, null, 2)}
              </pre>
            )}
            <Link
              href="/"
              className="mt-3 inline-block text-emerald-700 dark:text-emerald-300 font-medium underline"
            >
              Back to app
            </Link>
          </div>
        )}

        {status === "error" && (
          <div className="rounded-xl border border-red-200 dark:border-red-800 bg-red-50 dark:bg-red-950/30 p-4 text-sm text-red-800 dark:text-red-200">
            <p className="font-medium">{message}</p>
            {details && (
              <pre className="mt-2 overflow-auto rounded bg-white/50 dark:bg-black/20 p-2 text-xs">
                {JSON.stringify(details, null, 2)}
              </pre>
            )}
          </div>
        )}

        <p className="text-xs text-neutral-500 dark:text-neutral-400">
          <Link href="/" className="underline">
            ← Back to Neu Money Tracking
          </Link>
        </p>
      </div>
    </main>
  );
}
