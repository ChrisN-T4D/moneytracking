"use client";

import { useState } from "react";
import { formatCurrency } from "@/lib/format";
import { SPEND_CATEGORIES } from "@/lib/spendTaxonomy";
import type { StatementAnalyticsLine } from "@/lib/statementAnalytics";
import type { AnalyticsCadenceFilter } from "./CadenceOverview";

type LineItemsTableProps = {
  lines: StatementAnalyticsLine[];
  selectedCadence: AnalyticsCadenceFilter;
  updatingId: string | null;
  updateError: string | null;
  onUpdateCategory: (id: string, spendCategory: string, cadence: string) => Promise<void>;
};

type Draft = {
  spendCategory: string;
  cadence: string;
};

const CADENCE_OPTIONS = ["monthly", "biweekly", "variable", "income", "transfer"] as const;

function displayDate(value: string): string {
  const date = new Date(`${value.slice(0, 10)}T00:00:00`);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

function matchesSelectedCadence(line: StatementAnalyticsLine, selectedCadence: AnalyticsCadenceFilter): boolean {
  if (!selectedCadence) return true;
  return (line.cadence ?? (line.amount < 0 ? "variable" : "")) === selectedCadence;
}

export function LineItemsTable({
  lines,
  selectedCadence,
  updatingId,
  updateError,
  onUpdateCategory,
}: LineItemsTableProps) {
  const [drafts, setDrafts] = useState<Record<string, Draft>>({});
  const visibleLines = lines.filter((line) => matchesSelectedCadence(line, selectedCadence));

  function draftFor(line: StatementAnalyticsLine): Draft {
    return drafts[line.id] ?? {
      spendCategory: line.spendCategory ?? "",
      cadence: line.cadence ?? "",
    };
  }

  function updateDraft(line: StatementAnalyticsLine, patch: Partial<Draft>) {
    setDrafts((current) => ({
      ...current,
      [line.id]: {
        spendCategory: current[line.id]?.spendCategory ?? line.spendCategory ?? "",
        cadence: current[line.id]?.cadence ?? line.cadence ?? "",
        ...patch,
      },
    }));
  }

  async function saveLine(line: StatementAnalyticsLine) {
    const draft = draftFor(line);
    if (!draft.spendCategory || !draft.cadence) return;
    try {
      await onUpdateCategory(line.id, draft.spendCategory, draft.cadence);
    } catch {
      return;
    }
    setDrafts((current) => {
      const next = { ...current };
      delete next[line.id];
      return next;
    });
  }

  return (
    <section className="rounded-2xl border border-neutral-200 dark:border-neutral-700 bg-white dark:bg-neutral-900 p-4 shadow-sm">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h2 className="text-sm font-semibold text-neutral-900 dark:text-neutral-100">
            Statement lines
          </h2>
          <p className="mt-1 text-xs text-neutral-500 dark:text-neutral-400">
            Latest {lines.length} rows from analytics. Edit category or cadence inline.
          </p>
        </div>
        {selectedCadence && (
          <span className="rounded-full bg-neutral-100 px-2.5 py-1 text-xs font-medium text-neutral-600 dark:bg-neutral-800 dark:text-neutral-300">
            Filter: {selectedCadence}
          </span>
        )}
      </div>

      {updateError && (
        <p className="mt-3 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700 dark:border-red-900 dark:bg-red-950/40 dark:text-red-300">
          {updateError}
        </p>
      )}

      {visibleLines.length === 0 ? (
        <p className="mt-4 text-sm text-neutral-500 dark:text-neutral-400">No statement rows match this filter.</p>
      ) : (
        <div className="mt-4 overflow-x-auto">
          <table className="min-w-full divide-y divide-neutral-200 text-sm dark:divide-neutral-700">
            <thead>
              <tr className="text-left text-xs font-semibold uppercase tracking-wide text-neutral-500 dark:text-neutral-400">
                <th className="py-2 pr-3">Date</th>
                <th className="px-3 py-2">Description</th>
                <th className="px-3 py-2 text-right">Amount</th>
                <th className="px-3 py-2">Category</th>
                <th className="px-3 py-2">Cadence</th>
                <th className="px-3 py-2">Source</th>
                <th className="py-2 pl-3 text-right">Save</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-neutral-100 dark:divide-neutral-800">
              {visibleLines.map((line) => {
                const draft = draftFor(line);
                const dirty =
                  draft.spendCategory !== (line.spendCategory ?? "") ||
                  draft.cadence !== (line.cadence ?? "");
                const saving = updatingId === line.id;
                const amountClass =
                  line.amount < 0
                    ? "text-red-600 dark:text-red-400"
                    : "text-emerald-600 dark:text-emerald-400";

                return (
                  <tr key={line.id} className="align-top">
                    <td className="whitespace-nowrap py-3 pr-3 text-xs text-neutral-500 dark:text-neutral-400">
                      {displayDate(line.date)}
                    </td>
                    <td className="min-w-[220px] px-3 py-3">
                      <p className="font-medium text-neutral-900 dark:text-neutral-100">
                        {line.description}
                      </p>
                    </td>
                    <td className={`whitespace-nowrap px-3 py-3 text-right font-semibold tabular-nums ${amountClass}`}>
                      {formatCurrency(line.amount)}
                    </td>
                    <td className="min-w-[170px] px-3 py-3">
                      <select
                        value={draft.spendCategory}
                        onChange={(e) => updateDraft(line, { spendCategory: e.target.value })}
                        className="w-full rounded-lg border border-neutral-300 bg-white px-2 py-1.5 text-xs text-neutral-900 dark:border-neutral-600 dark:bg-neutral-800 dark:text-neutral-100"
                      >
                        <option value="">Choose category</option>
                        {SPEND_CATEGORIES.map((category) => (
                          <option key={category} value={category}>
                            {category}
                          </option>
                        ))}
                      </select>
                    </td>
                    <td className="min-w-[130px] px-3 py-3">
                      <select
                        value={draft.cadence}
                        onChange={(e) => updateDraft(line, { cadence: e.target.value })}
                        className="w-full rounded-lg border border-neutral-300 bg-white px-2 py-1.5 text-xs text-neutral-900 dark:border-neutral-600 dark:bg-neutral-800 dark:text-neutral-100"
                      >
                        <option value="">Choose cadence</option>
                        {CADENCE_OPTIONS.map((cadence) => (
                          <option key={cadence} value={cadence}>
                            {cadence}
                          </option>
                        ))}
                      </select>
                    </td>
                    <td className="min-w-[140px] px-3 py-3 text-xs text-neutral-500 dark:text-neutral-400">
                      {line.sourceFile ?? "-"}
                    </td>
                    <td className="whitespace-nowrap py-3 pl-3 text-right">
                      <button
                        type="button"
                        onClick={() => void saveLine(line)}
                        disabled={!dirty || !draft.spendCategory || !draft.cadence || saving}
                        className="rounded-lg border border-neutral-300 px-3 py-1.5 text-xs font-medium text-neutral-700 hover:bg-neutral-100 disabled:opacity-50 dark:border-neutral-600 dark:text-neutral-200 dark:hover:bg-neutral-800"
                      >
                        {saving ? "Saving..." : "Save"}
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}
