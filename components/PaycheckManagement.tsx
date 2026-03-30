"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { formatCurrency } from "@/lib/format";
import { getCardClasses, getSectionLabelClasses } from "@/lib/themePalettes";
import { useTheme } from "./ThemeProvider";
import type { PaycheckConfig } from "@/lib/types";

interface Props {
  paycheckConfigs: PaycheckConfig[];
}

export function PaycheckManagement({ paycheckConfigs }: Props) {
  const { theme } = useTheme();
  const router = useRouter();
  const [paychecks, setPaychecks] = useState(paycheckConfigs);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editFields, setEditFields] = useState<{
    name: string;
    frequency: string;
    anchorDate: string;
    amount: string;
  }>({ name: "", frequency: "biweekly", anchorDate: "", amount: "" });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [showAdd, setShowAdd] = useState(false);
  const [addFields, setAddFields] = useState({
    name: "",
    frequency: "biweekly",
    anchorDate: "",
    amount: "",
  });

  useEffect(() => {
    setPaychecks(paycheckConfigs);
  }, [paycheckConfigs]);

  function startEdit(pc: PaycheckConfig) {
    setEditingId(pc.id);
    setEditFields({
      name: pc.name,
      frequency: pc.frequency,
      anchorDate: pc.anchorDate ?? "",
      amount: String(pc.amount ?? ""),
    });
    setError("");
  }

  async function saveEdit() {
    if (!editingId) return;
    setSaving(true);
    setError("");
    try {
      const res = await fetch(`/api/paychecks/${editingId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          name: editFields.name.trim(),
          frequency: editFields.frequency,
          anchorDate: editFields.anchorDate || null,
          amount: editFields.amount ? Number(editFields.amount) : null,
        }),
      });
      const data = (await res.json()) as { ok?: boolean; message?: string };
      if (!res.ok || data.ok === false) {
        setError(data.message ?? "Failed to save.");
        return;
      }
      setEditingId(null);
      router.refresh();
    } catch {
      setError("Could not connect to server.");
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete(id: string) {
    if (!confirm("Delete this paycheck?")) return;
    setError("");
    try {
      const res = await fetch(`/api/paychecks/${id}`, {
        method: "DELETE",
        credentials: "include",
      });
      const data = (await res.json()) as { ok?: boolean; message?: string };
      if (!res.ok || data.ok === false) {
        setError(data.message ?? "Failed to delete.");
        return;
      }
      setPaychecks((prev) => prev.filter((p) => p.id !== id));
      router.refresh();
    } catch {
      setError("Could not connect to server.");
    }
  }

  async function handleAdd() {
    const name = addFields.name.trim();
    if (!name) {
      setError("Enter a name.");
      return;
    }
    setSaving(true);
    setError("");
    try {
      const res = await fetch("/api/paychecks", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          name,
          frequency: addFields.frequency,
          anchorDate: addFields.anchorDate || null,
          amount: addFields.amount ? Number(addFields.amount) : null,
        }),
      });
      const data = (await res.json()) as { ok?: boolean; message?: string };
      if (!res.ok || data.ok === false) {
        setError(data.message ?? "Failed to create.");
        return;
      }
      setShowAdd(false);
      setAddFields({ name: "", frequency: "biweekly", anchorDate: "", amount: "" });
      router.refresh();
    } catch {
      setError("Could not connect to server.");
    } finally {
      setSaving(false);
    }
  }

  const frequencies: { value: string; label: string }[] = [
    { value: "biweekly", label: "Every 2 weeks" },
    { value: "monthly", label: "Monthly" },
    { value: "monthlyLastWorkingDay", label: "Last working day" },
  ];

  return (
    <div className={getCardClasses(theme.summary) + " p-4 space-y-3"}>
      <h3 className={getSectionLabelClasses(theme.summary) + " text-sm font-semibold"}>
        Paychecks
      </h3>

      {error && (
        <p className="text-xs text-red-500">{error}</p>
      )}

      <div className="space-y-2">
        {paychecks.map((pc) =>
          editingId === pc.id ? (
            <div key={pc.id} className="space-y-2 rounded-lg border border-neutral-300 dark:border-neutral-600 p-3">
              <input
                className="w-full rounded-lg border border-neutral-300 dark:border-neutral-600 bg-white dark:bg-neutral-900 px-2 py-1 text-sm"
                placeholder="Name"
                value={editFields.name}
                onChange={(e) => setEditFields((f) => ({ ...f, name: e.target.value }))}
              />
              <select
                className="w-full rounded-lg border border-neutral-300 dark:border-neutral-600 bg-white dark:bg-neutral-900 px-2 py-1 text-sm"
                value={editFields.frequency}
                onChange={(e) => setEditFields((f) => ({ ...f, frequency: e.target.value }))}
              >
                {frequencies.map((fr) => (
                  <option key={fr.value} value={fr.value}>{fr.label}</option>
                ))}
              </select>
              <input
                type="date"
                className="w-full rounded-lg border border-neutral-300 dark:border-neutral-600 bg-white dark:bg-neutral-900 px-2 py-1 text-sm"
                value={editFields.anchorDate}
                onChange={(e) => setEditFields((f) => ({ ...f, anchorDate: e.target.value }))}
              />
              <input
                type="number"
                className="w-full rounded-lg border border-neutral-300 dark:border-neutral-600 bg-white dark:bg-neutral-900 px-2 py-1 text-sm"
                placeholder="Amount"
                value={editFields.amount}
                onChange={(e) => setEditFields((f) => ({ ...f, amount: e.target.value }))}
              />
              <div className="flex gap-2">
                <button
                  type="button"
                  disabled={saving}
                  onClick={() => void saveEdit()}
                  className="rounded-lg bg-sky-600 px-3 py-1 text-xs font-medium text-white hover:bg-sky-500 disabled:opacity-50"
                >
                  Save
                </button>
                <button
                  type="button"
                  onClick={() => setEditingId(null)}
                  className="rounded-lg border border-neutral-300 dark:border-neutral-600 px-3 py-1 text-xs"
                >
                  Cancel
                </button>
              </div>
            </div>
          ) : (
            <div
              key={pc.id}
              className="flex items-center justify-between rounded-lg border border-neutral-200 dark:border-neutral-700 px-3 py-2"
            >
              <div>
                <span className="text-sm font-medium text-neutral-900 dark:text-neutral-100">
                  {pc.name}
                </span>
                <span className="ml-2 text-xs text-neutral-500">
                  {frequencies.find((f) => f.value === pc.frequency)?.label ?? pc.frequency}
                  {pc.amount ? ` · ${formatCurrency(pc.amount)}` : ""}
                </span>
              </div>
              <div className="flex gap-1">
                <button
                  type="button"
                  onClick={() => startEdit(pc)}
                  className="rounded px-2 py-1 text-xs text-sky-600 hover:bg-sky-50 dark:hover:bg-sky-900/20"
                >
                  Edit
                </button>
                <button
                  type="button"
                  onClick={() => void handleDelete(pc.id)}
                  className="rounded px-2 py-1 text-xs text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20"
                >
                  Delete
                </button>
              </div>
            </div>
          )
        )}
      </div>

      {showAdd ? (
        <div className="space-y-2 rounded-lg border border-neutral-300 dark:border-neutral-600 p-3">
          <input
            className="w-full rounded-lg border border-neutral-300 dark:border-neutral-600 bg-white dark:bg-neutral-900 px-2 py-1 text-sm"
            placeholder="Paycheck name"
            value={addFields.name}
            onChange={(e) => setAddFields((f) => ({ ...f, name: e.target.value }))}
          />
          <select
            className="w-full rounded-lg border border-neutral-300 dark:border-neutral-600 bg-white dark:bg-neutral-900 px-2 py-1 text-sm"
            value={addFields.frequency}
            onChange={(e) => setAddFields((f) => ({ ...f, frequency: e.target.value }))}
          >
            {frequencies.map((fr) => (
              <option key={fr.value} value={fr.value}>{fr.label}</option>
            ))}
          </select>
          <input
            type="date"
            className="w-full rounded-lg border border-neutral-300 dark:border-neutral-600 bg-white dark:bg-neutral-900 px-2 py-1 text-sm"
            placeholder="Anchor date"
            value={addFields.anchorDate}
            onChange={(e) => setAddFields((f) => ({ ...f, anchorDate: e.target.value }))}
          />
          <input
            type="number"
            className="w-full rounded-lg border border-neutral-300 dark:border-neutral-600 bg-white dark:bg-neutral-900 px-2 py-1 text-sm"
            placeholder="Amount"
            value={addFields.amount}
            onChange={(e) => setAddFields((f) => ({ ...f, amount: e.target.value }))}
          />
          <div className="flex gap-2">
            <button
              type="button"
              disabled={saving}
              onClick={() => void handleAdd()}
              className="rounded-lg bg-sky-600 px-3 py-1 text-xs font-medium text-white hover:bg-sky-500 disabled:opacity-50"
            >
              Add
            </button>
            <button
              type="button"
              onClick={() => setShowAdd(false)}
              className="rounded-lg border border-neutral-300 dark:border-neutral-600 px-3 py-1 text-xs"
            >
              Cancel
            </button>
          </div>
        </div>
      ) : (
        <button
          type="button"
          onClick={() => { setShowAdd(true); setError(""); }}
          className="w-full rounded-lg border border-dashed border-neutral-300 dark:border-neutral-600 py-2 text-xs text-neutral-500 hover:border-sky-400 hover:text-sky-500"
        >
          + Add paycheck
        </button>
      )}
    </div>
  );
}
