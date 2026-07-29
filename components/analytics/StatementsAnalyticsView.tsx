"use client";

import { useCallback, useEffect, useState } from "react";
import { AnalyticsImportStrip } from "./AnalyticsImportStrip";
import { CadenceOverview, type AnalyticsCadenceFilter } from "./CadenceOverview";
import { CategoryBreakdown } from "./CategoryBreakdown";
import { LineItemsTable } from "./LineItemsTable";
import { NewVsKnownSection } from "./NewVsKnownSection";
import { TopMerchantsSection } from "./TopMerchantsSection";
import { TrendsSection } from "./TrendsSection";
import type { StatementAnalytics } from "@/lib/statementAnalytics";

type CategorizeStatus = "idle" | "loading" | "success" | "error";

type AnalyticsResponse = {
  ok?: boolean;
  analytics?: StatementAnalytics;
  message?: string;
};

type CategorizeResponse = {
  ok?: boolean;
  categorized?: number;
  skippedUser?: number;
  failed?: number;
  model?: string;
  message?: string;
};

function analyticsSummary(analytics: StatementAnalytics): string {
  const parts = [`${analytics.meta.statementCount} statements`];
  if (analytics.meta.from || analytics.meta.to) {
    parts.push(`${analytics.meta.from ?? "start"} to ${analytics.meta.to ?? "today"}`);
  }
  if (analytics.uncategorizedCount > 0) {
    parts.push(`${analytics.uncategorizedCount} need labels`);
  }
  return parts.join(" / ");
}

export function StatementsAnalyticsView() {
  const [analytics, setAnalytics] = useState<StatementAnalytics | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [selectedCadence, setSelectedCadence] = useState<AnalyticsCadenceFilter>(null);
  const [categorizeStatus, setCategorizeStatus] = useState<CategorizeStatus>("idle");
  const [categorizeMessage, setCategorizeMessage] = useState<string | null>(null);
  const [categorizeError, setCategorizeError] = useState<string | null>(null);
  const [updatingId, setUpdatingId] = useState<string | null>(null);
  const [updateError, setUpdateError] = useState<string | null>(null);

  const loadAnalytics = useCallback(async () => {
    setLoading(true);
    setLoadError(null);
    try {
      const res = await fetch("/api/statements/analytics", {
        credentials: "include",
        cache: "no-store",
      });
      const data = (await res.json()) as AnalyticsResponse;
      if (!res.ok || !data.ok || !data.analytics) {
        throw new Error(data.message ?? "Could not load statement analytics.");
      }
      setAnalytics(data.analytics);
    } catch (err) {
      setLoadError(err instanceof Error ? err.message : "Could not load statement analytics.");
    } finally {
      setLoading(false);
    }
  }, []);

  const runCategorize = useCallback(async () => {
    setCategorizeStatus("loading");
    setCategorizeMessage(null);
    setCategorizeError(null);
    try {
      const res = await fetch("/api/statements/categorize", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ force: false }),
      });
      const data = (await res.json()) as CategorizeResponse;
      if (!res.ok || !data.ok) {
        throw new Error(data.message ?? "Categorization failed.");
      }
      const failed = data.failed ?? 0;
      setCategorizeStatus(failed > 0 ? "error" : "success");
      setCategorizeMessage(
        `Categorized ${data.categorized ?? 0} statement${data.categorized === 1 ? "" : "s"}` +
          ` with ${data.model ?? "the model"}. ${data.skippedUser ?? 0} user override${data.skippedUser === 1 ? "" : "s"} skipped.`
      );
      if (failed > 0) {
        setCategorizeError(`${failed} statement${failed === 1 ? "" : "s"} failed to update.`);
      }
      await loadAnalytics();
    } catch (err) {
      setCategorizeStatus("error");
      setCategorizeError(err instanceof Error ? err.message : "Categorization failed.");
      await loadAnalytics();
    }
  }, [loadAnalytics]);

  useEffect(() => {
    void loadAnalytics();
  }, [loadAnalytics]);

  async function updateCategory(id: string, spendCategory: string, cadence: string) {
    setUpdatingId(id);
    setUpdateError(null);
    try {
      const res = await fetch(`/api/statements/${encodeURIComponent(id)}/category`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ spendCategory, cadence }),
      });
      const data = (await res.json()) as { ok?: boolean; message?: string };
      if (!res.ok || !data.ok) {
        throw new Error(data.message ?? "Could not update statement category.");
      }
      await loadAnalytics();
    } catch (err) {
      const message = err instanceof Error ? err.message : "Could not update statement category.";
      setUpdateError(message);
      throw err;
    } finally {
      setUpdatingId(null);
    }
  }

  return (
    <div className="space-y-4">
      <AnalyticsImportStrip
        onImported={runCategorize}
        onRetryCategorize={runCategorize}
        categorizeStatus={categorizeStatus}
        categorizeMessage={categorizeMessage}
        categorizeError={categorizeError}
      />

      <section className="rounded-2xl border border-neutral-200 dark:border-neutral-700 bg-white dark:bg-neutral-900 p-4 shadow-sm">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <h1 className="text-base font-semibold text-neutral-900 dark:text-neutral-100">
              Statement analytics
            </h1>
            <p className="mt-1 text-xs text-neutral-500 dark:text-neutral-400">
              {analytics ? analyticsSummary(analytics) : "Loading statement analytics..."}
            </p>
          </div>
          <button
            type="button"
            onClick={() => void loadAnalytics()}
            disabled={loading}
            className="rounded-lg border border-neutral-300 px-3 py-2 text-xs font-medium text-neutral-700 hover:bg-neutral-100 disabled:opacity-50 dark:border-neutral-600 dark:text-neutral-200 dark:hover:bg-neutral-800"
          >
            {loading ? "Refreshing..." : "Refresh"}
          </button>
        </div>
        {loadError && (
          <p className="mt-3 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700 dark:border-red-900 dark:bg-red-950/40 dark:text-red-300">
            {loadError}
          </p>
        )}
      </section>

      {loading && !analytics ? (
        <div className="grid gap-4 lg:grid-cols-2">
          <div className="h-56 animate-pulse rounded-2xl bg-neutral-200/80 dark:bg-neutral-800" />
          <div className="h-56 animate-pulse rounded-2xl bg-neutral-200/80 dark:bg-neutral-800" />
          <div className="h-56 animate-pulse rounded-2xl bg-neutral-200/80 dark:bg-neutral-800" />
          <div className="h-56 animate-pulse rounded-2xl bg-neutral-200/80 dark:bg-neutral-800" />
        </div>
      ) : analytics ? (
        <>
          <div className="grid gap-4 lg:grid-cols-2">
            <CadenceOverview
              analytics={analytics}
              selectedCadence={selectedCadence}
              onSelectCadence={setSelectedCadence}
            />
            <NewVsKnownSection analytics={analytics} selectedCadence={selectedCadence} />
          </div>

          <div className="grid gap-4 xl:grid-cols-3">
            <CategoryBreakdown analytics={analytics} selectedCadence={selectedCadence} />
            <TrendsSection analytics={analytics} selectedCadence={selectedCadence} />
            <TopMerchantsSection analytics={analytics} selectedCadence={selectedCadence} />
          </div>

          <LineItemsTable
            lines={analytics.lines}
            selectedCadence={selectedCadence}
            updatingId={updatingId}
            updateError={updateError}
            onUpdateCategory={updateCategory}
          />
        </>
      ) : (
        <p className="rounded-2xl border border-neutral-200 bg-white p-4 text-sm text-neutral-500 dark:border-neutral-700 dark:bg-neutral-900 dark:text-neutral-400">
          No analytics data is available yet.
        </p>
      )}
    </div>
  );
}
