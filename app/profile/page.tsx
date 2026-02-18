"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/components/AuthProvider";
import { useTheme } from "@/components/ThemeProvider";
import { PALETTE_IDS, PALETTE_LABELS, getSwatchClasses, type PaletteId } from "@/lib/themePalettes";
import { getCardClasses } from "@/lib/themePalettes";

export default function ProfilePage() {
  const { user, loading, refreshMe, updateUser } = useAuth();
  const { theme, updateSection } = useTheme();
  const router = useRouter();
  const [name, setName] = useState("");
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<{ type: "success" | "error"; text: string } | null>(null);
  const [themeSaving, setThemeSaving] = useState(false);

  useEffect(() => {
    if (user) {
      setName(user.name || "");
    } else if (!loading) {
      // Redirect to home if not logged in
      router.push("/");
    }
  }, [user, loading, router]);

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <span className="text-neutral-400">Loading…</span>
      </div>
    );
  }

  if (!user) {
    return null; // Will redirect via useEffect
  }

  async function handleSaveName() {
    if (!user) return;
    setSaving(true);
    setMessage(null);
    try {
      const res = await fetch("/api/profile", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: name.trim() }),
        credentials: "include",
      });
      const data = (await res.json()) as { ok?: boolean; message?: string; name?: string };
      if (res.ok && data.ok) {
        setMessage({ type: "success", text: "Display name updated!" });
        const newName = typeof data.name === "string" ? data.name.trim() : name.trim();
        updateUser({ name: newName });
        await refreshMe();
      } else {
        const errorMsg = data.message ?? `Failed to update name (${res.status}).`;
        console.error("Save name error:", errorMsg);
        setMessage({ type: "error", text: errorMsg });
      }
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : "Failed to update name.";
      console.error("Save name error:", err);
      setMessage({ type: "error", text: errorMsg });
    } finally {
      setSaving(false);
    }
  }

  async function handleSaveTheme() {
    if (!user) return;
    setThemeSaving(true);
    setMessage(null);
    try {
      const res = await fetch("/api/profile", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          theme: {
            summary: theme.summary,
            paychecks: theme.paychecks,
            bills: theme.bills,
            spanishFork: theme.spanishFork,
            autoTransfers: theme.autoTransfers,
          },
        }),
        credentials: "include",
      });
      const data = (await res.json()) as { ok?: boolean; message?: string };
      if (res.ok && data.ok) {
        setMessage({ type: "success", text: "Theme preferences saved!" });
      } else {
        setMessage({ type: "error", text: data.message ?? "Failed to save theme." });
        console.error("Theme save error:", data);
      }
    } catch (err) {
      setMessage({ type: "error", text: err instanceof Error ? err.message : "Failed to save theme." });
      console.error("Theme save error:", err);
    } finally {
      setThemeSaving(false);
    }
  }

  return (
    <div className="min-h-screen pb-safe bg-neutral-100 dark:bg-neutral-900">
      <header className="sticky top-0 z-10 bg-neutral-100/95 dark:bg-neutral-900/95 backdrop-blur supports-[backdrop-filter]:bg-neutral-100/80 dark:supports-[backdrop-filter]:bg-neutral-900/80 border-b border-neutral-200 dark:border-neutral-800 px-4 py-3 safe-area-inset-top">
        <div className="flex items-center justify-between gap-2 max-w-2xl mx-auto">
          <button
            type="button"
            onClick={() => router.back()}
            className="rounded-lg p-1.5 text-neutral-500 hover:text-neutral-700 dark:hover:text-neutral-300 hover:bg-neutral-100 dark:hover:bg-neutral-800"
            aria-label="Back"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
            </svg>
          </button>
          <h1 className="text-xl font-semibold text-neutral-900 dark:text-neutral-100">Profile</h1>
          <div className="w-9" /> {/* Spacer */}
        </div>
      </header>

      <div className="p-4 space-y-6 max-w-2xl mx-auto">
        {/* Display Name Section */}
        <section className={getCardClasses(theme.summary)}>
          <h2 className="text-base font-semibold text-neutral-900 dark:text-neutral-100 mb-3">
            Display Name
          </h2>
          <div className="space-y-3">
            <div>
              <label htmlFor="profile-name" className="block text-xs font-medium text-neutral-700 dark:text-neutral-300 mb-1">
                Name
              </label>
              <input
                id="profile-name"
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                className="w-full rounded-lg border border-neutral-300 bg-white px-3 py-2 text-sm text-neutral-900 placeholder:text-neutral-400 dark:border-neutral-600 dark:bg-neutral-800 dark:text-neutral-100"
                placeholder="Your name"
              />
            </div>
            <button
              type="button"
              onClick={handleSaveName}
              disabled={saving || name.trim() === (user.name || "")}
              className="rounded-lg bg-sky-600 px-4 py-2 text-sm font-medium text-white hover:bg-sky-500 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {saving ? "Saving…" : "Save name"}
            </button>
          </div>
        </section>

        {/* Theme Preferences Section */}
        <section className={getCardClasses(theme.summary)}>
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-base font-semibold text-neutral-900 dark:text-neutral-100">
              Theme Preferences
            </h2>
            <button
              type="button"
              onClick={handleSaveTheme}
              disabled={themeSaving}
              className="rounded-lg bg-emerald-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-emerald-500 disabled:opacity-50"
            >
              {themeSaving ? "Saving…" : "Save theme"}
            </button>
          </div>
          <p className="text-xs text-neutral-500 dark:text-neutral-400 mb-4">
            Customize the colors for each section on the main page.
          </p>
          <div className="space-y-3">
            <PreferenceRow
              label="Summary"
              value={theme.summary}
              onChange={(val) => updateSection("summary", val)}
            />
            <PreferenceRow
              label="Paychecks"
              value={theme.paychecks}
              onChange={(val) => updateSection("paychecks", val)}
            />
            <PreferenceRow
              label="Bills"
              value={theme.bills}
              onChange={(val) => updateSection("bills", val)}
            />
            <PreferenceRow
              label="Spanish Fork"
              value={theme.spanishFork}
              onChange={(val) => updateSection("spanishFork", val)}
            />
            <PreferenceRow
              label="Auto Transfers"
              value={theme.autoTransfers}
              onChange={(val) => updateSection("autoTransfers", val)}
            />
          </div>
        </section>

        {/* Message */}
        {message && (
          <div
            className={`rounded-lg border p-3 text-sm ${
              message.type === "success"
                ? "border-emerald-200 bg-emerald-50 text-emerald-800 dark:border-emerald-800 dark:bg-emerald-900/30 dark:text-emerald-200"
                : "border-red-200 bg-red-50 text-red-800 dark:border-red-800 dark:bg-red-900/30 dark:text-red-200"
            }`}
          >
            {message.text}
          </div>
        )}
      </div>
    </div>
  );
}

interface PreferenceRowProps {
  label: string;
  value: PaletteId;
  onChange: (val: PaletteId) => void;
}

function PreferenceRow({ label, value, onChange }: PreferenceRowProps) {
  return (
    <label className="flex items-center justify-between gap-3">
      <span className="text-sm text-neutral-700 dark:text-neutral-300">{label}</span>
      <div className="flex items-center gap-2 flex-1 max-w-[240px] justify-end">
        <span
          className={`w-9 h-9 shrink-0 ${getSwatchClasses(value)}`}
          title={PALETTE_LABELS[value]}
          aria-hidden
        />
        <select
          value={value}
          onChange={(e) => onChange(e.target.value as PaletteId)}
          className="flex-1 min-w-0 rounded-lg border border-neutral-300 bg-white px-3 py-1.5 text-sm text-neutral-700 shadow-sm dark:border-neutral-600 dark:bg-neutral-800 dark:text-neutral-200"
        >
          {PALETTE_IDS.map((id) => (
            <option key={id} value={id}>
              {PALETTE_LABELS[id]}
            </option>
          ))}
        </select>
      </div>
    </label>
  );
}
