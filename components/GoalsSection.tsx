"use client";

import { useState, useRef } from "react";
import { formatCurrency } from "@/lib/format";
import type { MoneyGoal } from "@/lib/types";
import { getCardClasses, getSectionLabelClasses } from "@/lib/themePalettes";
import { useTheme } from "./ThemeProvider";
import { useGoals } from "./GoalsContext";

export function GoalsSection() {
  const { theme } = useTheme();
  const { goals, setGoals, updateGoalContribution } = useGoals();
  const [name, setName] = useState("");
  const [targetAmount, setTargetAmount] = useState("");
  const [category, setCategory] = useState("");
  const [targetDate, setTargetDate] = useState("");
  const [saving, setSaving] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [error, setError] = useState("");
  // Inline monthly contribution editing: goalId → editing value
  const [editingContrib, setEditingContrib] = useState<string | null>(null);
  const [contribValue, setContribValue] = useState("");
  const [contribError, setContribError] = useState<string | null>(null);
  const contribRef = useRef<HTMLInputElement>(null);

  async function handleAddGoal(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    const trimmedName = name.trim();
    const amt = Number(targetAmount);
    if (!trimmedName || !Number.isFinite(amt) || amt <= 0) {
      setError("Enter a name and a positive target amount.");
      return;
    }
    setSaving(true);
    try {
      const res = await fetch("/api/goals", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: trimmedName,
          targetAmount: amt,
          currentAmount: 0,
          targetDate: targetDate || null,
          category: category || null,
        }),
      });
      const data = (await res.json()) as { ok?: boolean; goal?: MoneyGoal; message?: string };
      if (!res.ok || data.ok === false || !data.goal) {
        setError(data.message ?? "Failed to create goal.");
        return;
      }
      setGoals((prev) => [...prev, data.goal!]);
      setName("");
      setTargetAmount("");
      setCategory("");
      setTargetDate("");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to create goal.");
    } finally {
      setSaving(false);
    }
  }

  async function handleSaveContrib(goalId: string) {
    const num = contribValue.trim() === "" ? null : Number(contribValue);
    setEditingContrib(null);
    setContribError(null);
    // Update context immediately — SummaryCard left over updates instantly
    updateGoalContribution(goalId, num);
    const isStaticGoal = goalId.length < 10 || /^g\d+$/.test(goalId);
    if (isStaticGoal) return; // static goals: context update is enough, no PB record
    try {
      const res = await fetch(`/api/goals/${encodeURIComponent(goalId)}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ monthlyContribution: num }),
        credentials: "include",
      });
      if (!res.ok) {
        const data = (await res.json().catch(() => ({}))) as { message?: string };
        setContribError(data.message ?? `Save failed (${res.status})`);
      }
    } catch {
      setContribError("Could not connect to server.");
    }
  }

  async function handleDelete(id: string) {
    setDeletingId(id);
    setError("");
    // Static/seed goals (e.g. g1, g2) are not in PocketBase — remove from state and store in localStorage
    const isStaticGoal = id.length < 10 || /^g\d+$/.test(id);
    if (isStaticGoal) {
      // Store deleted static goal IDs in localStorage so they don't reappear on refresh
      try {
        const deleted = JSON.parse(localStorage.getItem("deletedStaticGoals") || "[]") as string[];
        if (!deleted.includes(id)) {
          deleted.push(id);
          localStorage.setItem("deletedStaticGoals", JSON.stringify(deleted));
        }
      } catch {
        // Ignore localStorage errors
      }
      setGoals((prev) => prev.filter((g) => g.id !== id));
      setDeletingId(null);
      return;
    }
    try {
      const res = await fetch(`/api/goals?id=${encodeURIComponent(id)}`, {
        method: "DELETE",
        credentials: "include",
      });
      const data = (await res.json()) as { ok?: boolean; message?: string };
      if (!res.ok || data.ok === false) {
        if (res.status === 404) {
          setGoals((prev) => prev.filter((g) => g.id !== id));
          return;
        }
        setError(data.message ?? "Failed to delete goal.");
        return;
      }
      setGoals((prev) => prev.filter((g) => g.id !== id));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to delete goal.");
    } finally {
      setDeletingId(null);
    }
  }

  return (
    <section className={getCardClasses(theme.summary)}>
      <h2 className={getSectionLabelClasses(theme.summary)}>Money goals</h2>
      <p className="mb-3 text-xs text-neutral-600 dark:text-neutral-400">
        Track progress toward your current savings and payoff goals.
      </p>

      <form onSubmit={handleAddGoal} className="mb-3 flex flex-wrap items-end gap-2">
        <div className="flex-1 min-w-[120px]">
          <label className="block text-[11px] font-medium text-neutral-700 dark:text-neutral-300">
            Goal
          </label>
          <input
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="e.g. Emergency fund"
            className="mt-1 w-full rounded-lg border border-neutral-300 bg-white px-2 py-1.5 text-xs text-neutral-900 placeholder:text-neutral-400 dark:border-neutral-700 dark:bg-neutral-900 dark:text-neutral-100"
          />
        </div>
        <div className="w-28">
          <label className="block text-[11px] font-medium text-neutral-700 dark:text-neutral-300">
            Target
          </label>
          <input
            type="number"
            min={0}
            step={0.01}
            value={targetAmount}
            onChange={(e) => setTargetAmount(e.target.value)}
            className="mt-1 w-full rounded-lg border border-neutral-300 bg-white px-2 py-1.5 text-xs text-neutral-900 dark:border-neutral-700 dark:bg-neutral-900 dark:text-neutral-100"
          />
        </div>
        <div className="w-28">
          <label className="block text-[11px] font-medium text-neutral-700 dark:text-neutral-300">
            Target date
          </label>
          <input
            type="date"
            value={targetDate}
            onChange={(e) => setTargetDate(e.target.value)}
            className="mt-1 w-full rounded-lg border border-neutral-300 bg-white px-2 py-1.5 text-xs text-neutral-900 dark:border-neutral-700 dark:bg-neutral-900 dark:text-neutral-100"
          />
        </div>
        <div className="w-28">
          <label className="block text-[11px] font-medium text-neutral-700 dark:text-neutral-300">
            Category
          </label>
          <input
            type="text"
            value={category}
            onChange={(e) => setCategory(e.target.value)}
            placeholder="Savings"
            className="mt-1 w-full rounded-lg border border-neutral-300 bg-white px-2 py-1.5 text-xs text-neutral-900 placeholder:text-neutral-400 dark:border-neutral-700 dark:bg-neutral-900 dark:text-neutral-100"
          />
        </div>
        <button
          type="submit"
          disabled={saving}
          className="h-8 rounded-lg bg-emerald-600 px-3 text-xs font-medium text-white hover:bg-emerald-500 disabled:opacity-50"
        >
          {saving ? "Adding…" : "Add goal"}
        </button>
      </form>

      {error && (
        <p className="mb-2 text-[11px] text-red-600 dark:text-red-400">
          {error}
        </p>
      )}
      {contribError && (
        <p className="mb-2 text-[11px] text-amber-600 dark:text-amber-400">
          Contribution save error: {contribError}
        </p>
      )}

      {goals.length > 0 && (
        <ul className="space-y-3">
          {goals.map((g) => {
            const pct =
              g.targetAmount > 0
                ? Math.min(100, Math.round((g.currentAmount / g.targetAmount) * 100))
                : 0;
            return (
              <li
                key={g.id}
                className="rounded-lg bg-white/60 dark:bg-neutral-950/40 p-2.5 border border-neutral-100/70 dark:border-neutral-800/70"
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-neutral-900 dark:text-neutral-100">
                      {g.name}
                    </p>
                    {g.category && (
                      <p className="text-[11px] text-neutral-500 dark:text-neutral-400">
                        {g.category}
                      </p>
                    )}
                    {/* Monthly contribution inline edit */}
                    <div className="mt-1 flex items-center gap-1">
                      <span className="text-[11px] text-neutral-500 dark:text-neutral-400">Monthly:</span>
                      {editingContrib === g.id ? (
                        <input
                          ref={contribRef}
                          autoFocus
                          type="number"
                          inputMode="decimal"
                          min={0}
                          value={contribValue}
                          onChange={(e) => setContribValue(e.target.value)}
                          onBlur={() => void handleSaveContrib(g.id)}
                          onKeyDown={(e) => {
                            if (e.key === "Enter") void handleSaveContrib(g.id);
                            if (e.key === "Escape") setEditingContrib(null);
                          }}
                          className="w-20 rounded border border-sky-400 bg-white dark:bg-neutral-900 px-1.5 py-0.5 text-right text-xs tabular-nums text-neutral-900 dark:text-neutral-100 outline-none"
                        />
                      ) : (
                        <button
                          type="button"
                          onClick={() => {
                            setEditingContrib(g.id);
                            setContribValue(g.monthlyContribution != null ? String(g.monthlyContribution) : "");
                          }}
                          className="text-[11px] text-amber-600 dark:text-amber-400 underline-offset-2 hover:underline cursor-text"
                          title="Tap to set monthly contribution"
                        >
                          {g.monthlyContribution != null ? formatCurrency(g.monthlyContribution) + "/mo" : "Set contribution"}
                        </button>
                      )}
                    </div>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <div className="text-right text-xs text-neutral-600 dark:text-neutral-300">
                      <p>
                        {formatCurrency(g.currentAmount)} / {formatCurrency(g.targetAmount)}
                      </p>
                      <p className="font-semibold">{pct}%</p>
                    </div>
                    <button
                      type="button"
                      onClick={() => handleDelete(g.id)}
                      disabled={deletingId === g.id}
                      className="rounded-full p-1 text-xs text-neutral-400 hover:bg-neutral-100 hover:text-red-600 dark:hover:bg-neutral-800 dark:hover:text-red-400 disabled:opacity-50"
                      aria-label={`Remove goal ${g.name}`}
                    >
                      ✕
                    </button>
                  </div>
                </div>
                <div className="mt-2 h-1.5 w-full rounded-full bg-neutral-200 dark:bg-neutral-800 overflow-hidden">
                  <div
                    className="h-full rounded-full bg-emerald-500 dark:bg-emerald-400"
                    style={{ width: `${pct}%` }}
                  />
                </div>
                {g.targetDate && (
                  <p className="mt-1 text-[11px] text-neutral-500 dark:text-neutral-400">
                    Target by {g.targetDate}
                  </p>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}


