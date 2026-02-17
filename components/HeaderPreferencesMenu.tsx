"use client";

import { useState } from "react";
import { useTheme } from "./ThemeProvider";
import { PALETTE_IDS, PALETTE_LABELS, type PaletteId } from "@/lib/themePalettes";

export function HeaderPreferencesMenu() {
  const { theme, updateSection } = useTheme();
  const [open, setOpen] = useState(false);

  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="inline-flex h-9 w-9 items-center justify-center rounded-full border border-neutral-200 bg-white/80 text-neutral-700 shadow-sm hover:bg-neutral-100 dark:border-neutral-700 dark:bg-neutral-900/80 dark:text-neutral-200 dark:hover:bg-neutral-800"
        aria-label="Open preferences"
      >
        <span className="sr-only">Open preferences</span>
        <svg
          className="h-4 w-4"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth={2}
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <path d="M4 6h16" />
          <path d="M4 12h16" />
          <path d="M4 18h16" />
        </svg>
      </button>

      {open && (
        <div className="absolute right-0 mt-2 w-64 rounded-xl border border-neutral-200 bg-white/95 p-3 text-xs shadow-lg dark:border-neutral-700 dark:bg-neutral-900/95">
          <div className="flex items-center justify-between mb-2">
            <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-neutral-500 dark:text-neutral-400">
              Preferences
            </p>
            <button
              type="button"
              onClick={() => setOpen(false)}
              className="rounded p-1 text-neutral-400 hover:bg-neutral-100 hover:text-neutral-700 dark:hover:bg-neutral-800 dark:hover:text-neutral-200"
              aria-label="Close preferences"
            >
              ×
            </button>
          </div>

          <p className="mb-2 text-[11px] text-neutral-500 dark:text-neutral-400">
            Customize accent colors for each section. Saved in this browser only.
          </p>

          <div className="space-y-2">
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
              label="Auto transfers"
              value={theme.autoTransfers}
              onChange={(val) => updateSection("autoTransfers", val)}
            />
          </div>
        </div>
      )}
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
    <label className="flex items-center justify-between gap-2">
      <span className="text-[11px] text-neutral-600 dark:text-neutral-300">{label}</span>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value as PaletteId)}
        className="flex-1 rounded-lg border border-neutral-200 bg-white px-2 py-1 text-[11px] text-neutral-700 shadow-sm dark:border-neutral-700 dark:bg-neutral-900 dark:text-neutral-200"
      >
        {PALETTE_IDS.map((id) => (
          <option key={id} value={id}>
            {PALETTE_LABELS[id]}
          </option>
        ))}
      </select>
    </label>
  );
}

