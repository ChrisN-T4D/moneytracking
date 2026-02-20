"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { AddItemsToBillsModal } from "@/components/AddItemsToBillsModal";
import { AddPaychecksFromStatementsModal } from "@/components/AddPaychecksFromStatementsModal";
import { StatementUploadModal } from "@/components/StatementUploadModal";

export function HeaderPreferencesMenu() {
  const [open, setOpen] = useState(false);
  const [openUploadModal, setOpenUploadModal] = useState(false);
  const [openPaychecksModal, setOpenPaychecksModal] = useState(false);
  const [openBillsModal, setOpenBillsModal] = useState(false);
  const router = useRouter();

  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="inline-flex h-9 items-center justify-center gap-1.5 rounded-full border border-neutral-200 bg-white/80 px-4 text-neutral-700 shadow-sm hover:bg-neutral-100 dark:border-neutral-700 dark:bg-neutral-900/80 dark:text-neutral-200 dark:hover:bg-neutral-800"
        aria-label="Open preferences"
      >
        <span className="sr-only">Open preferences</span>
        <svg
          className="h-4 w-4 shrink-0"
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
        <div className="absolute right-0 z-[100] mt-4 w-64 rounded-xl border border-neutral-200 bg-white/95 p-3 text-xs shadow-lg dark:border-neutral-700 dark:bg-neutral-900/95">
          <div className="flex items-center justify-between mb-2">
            <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-neutral-500 dark:text-neutral-400">
              Preferences
            </p>
            <button
              type="button"
              onClick={() => setOpen(false)}
              className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-full border border-neutral-300 bg-neutral-100 text-neutral-600 shadow-sm hover:bg-neutral-200 hover:text-neutral-800 dark:border-neutral-600 dark:bg-neutral-800 dark:text-neutral-300 dark:hover:bg-neutral-700 dark:hover:text-neutral-100"
              aria-label="Close preferences"
            >
              ×
            </button>
          </div>

          <div className="space-y-1.5">
            <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-neutral-500 dark:text-neutral-500">
              Shortcuts
            </p>
            <button
              type="button"
              className="w-full rounded-full bg-neutral-600 text-white px-3 py-1.5 text-sm font-medium shadow-sm hover:bg-neutral-500 dark:bg-neutral-500 dark:hover:bg-neutral-400"
              onClick={() => {
                setOpen(false);
                router.push("/profile");
              }}
            >
              Profile
            </button>
            <button
              type="button"
              className="w-full rounded-full bg-neutral-600 text-white px-3 py-1.5 text-sm font-medium shadow-sm hover:bg-neutral-500 dark:bg-neutral-500 dark:hover:bg-neutral-400"
              onClick={() => {
                setOpen(false);
                setOpenUploadModal(true);
              }}
            >
              Statement upload
            </button>
            <div className="pt-0.5 space-y-1.5">
              <button
                type="button"
                className="w-full rounded-full bg-emerald-600 text-white px-3 py-1.5 text-sm font-medium shadow-sm hover:bg-emerald-500"
                onClick={() => {
                  setOpen(false);
                  setOpenPaychecksModal(true);
                }}
              >
                Add paychecks from statements
              </button>
              <button
                type="button"
                className="w-full rounded-full bg-sky-600 text-white px-3 py-1.5 text-sm font-medium shadow-sm hover:bg-sky-500"
                onClick={() => {
                  setOpen(false);
                  setOpenBillsModal(true);
                }}
              >
                Add items to bills
              </button>
            </div>
          </div>
        </div>
      )}

      <StatementUploadModal open={openUploadModal} onClose={() => setOpenUploadModal(false)} />
      <AddPaychecksFromStatementsModal open={openPaychecksModal} onClose={() => setOpenPaychecksModal(false)} />
      <AddItemsToBillsModal open={openBillsModal} onClose={() => setOpenBillsModal(false)} />
    </div>
  );
}

