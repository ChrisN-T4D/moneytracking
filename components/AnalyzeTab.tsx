"use client";

import { useCallback, useEffect, useState } from "react";
import { formatCurrency } from "@/lib/format";
import { getCardClasses } from "@/lib/themePalettes";
import { useTheme } from "./ThemeProvider";
import type { AnalyzeSnapshot } from "@/lib/analyzeSnapshot";

type BriefSections = { cash: string; spend: string; cuts: string };

type ChatMsg = { role: "user" | "assistant"; content: string };

const STARTER_CHIPS = [
  "Biggest bills this cycle?",
  "What subscriptions can we cut?",
  "Where are we overspending?",
];

function SectionBody({ text }: { text: string }) {
  if (!text) return <p className="text-sm text-neutral-500">—</p>;
  const lines = text.split("\n").filter((l) => l.trim());
  return (
    <div className="text-sm text-neutral-800 dark:text-neutral-200 space-y-1 whitespace-pre-wrap">
      {lines.map((line, i) => (
        <p key={i}>{line.replace(/^[-*•]\s*/, "• ")}</p>
      ))}
    </div>
  );
}

export function AnalyzeTab() {
  const { theme } = useTheme();
  const [snapshot, setSnapshot] = useState<AnalyzeSnapshot | null>(null);
  const [sections, setSections] = useState<BriefSections | null>(null);
  const [briefLoading, setBriefLoading] = useState(true);
  const [briefError, setBriefError] = useState<string | null>(null);
  const [analystDown, setAnalystDown] = useState(false);
  const [factsOpen, setFactsOpen] = useState(false);
  const [messages, setMessages] = useState<ChatMsg[]>([]);
  const [input, setInput] = useState("");
  const [chatBusy, setChatBusy] = useState(false);
  const [chatError, setChatError] = useState<string | null>(null);

  const loadBrief = useCallback(async (force = false) => {
    setBriefLoading(true);
    setBriefError(null);
    setAnalystDown(false);
    try {
      const res = await fetch("/api/analyze/brief", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ force }),
      });
      const data = (await res.json()) as {
        ok?: boolean;
        sections?: BriefSections;
        snapshot?: AnalyzeSnapshot;
        message?: string;
        analystUnavailable?: boolean;
      };
      if (data.snapshot) setSnapshot(data.snapshot);
      if (data.analystUnavailable || res.status === 503) {
        setAnalystDown(true);
        setBriefError(data.message ?? "Analyst unavailable");
        if (!data.snapshot) {
          const snapRes = await fetch("/api/analyze/snapshot", { credentials: "include" });
          const snapData = (await snapRes.json()) as { ok?: boolean; snapshot?: AnalyzeSnapshot };
          if (snapData.snapshot) setSnapshot(snapData.snapshot);
        }
        return;
      }
      if (!res.ok || !data.ok || !data.sections) {
        setBriefError(data.message ?? "Could not load brief.");
        return;
      }
      setSections(data.sections);
    } catch (e) {
      setBriefError(e instanceof Error ? e.message : "Brief failed.");
    } finally {
      setBriefLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadBrief(false);
  }, [loadBrief]);

  async function sendChat(text: string) {
    const trimmed = text.trim();
    if (!trimmed || chatBusy) return;
    const next: ChatMsg[] = [...messages, { role: "user", content: trimmed }];
    setMessages(next);
    setInput("");
    setChatBusy(true);
    setChatError(null);
    try {
      const res = await fetch("/api/analyze/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ messages: next, briefSections: sections }),
      });
      const data = (await res.json()) as {
        ok?: boolean;
        reply?: string;
        message?: string;
        analystUnavailable?: boolean;
      };
      if (data.analystUnavailable || res.status === 503) {
        setAnalystDown(true);
        setChatError(data.message ?? "Analyst unavailable");
        return;
      }
      if (!res.ok || !data.ok || !data.reply) {
        setChatError(data.message ?? "Chat failed.");
        return;
      }
      setMessages([...next, { role: "assistant", content: data.reply }]);
    } catch (e) {
      setChatError(e instanceof Error ? e.message : "Chat failed.");
    } finally {
      setChatBusy(false);
    }
  }

  const throughLabel = snapshot?.window.nextPaydayLabel ?? "next payday";

  return (
    <div className="space-y-4">
      <div className={getCardClasses(theme.summary)}>
        <div className="flex items-start justify-between gap-2 mb-3">
          <div>
            <h2 className="text-sm font-semibold text-neutral-900 dark:text-white">
              Paycheck brief
            </h2>
            <p className="text-[11px] text-neutral-500 dark:text-neutral-400 mt-0.5">
              Through {throughLabel}
              {snapshot?.window.daysUntilPayday != null
                ? ` · ${snapshot.window.daysUntilPayday}d`
                : ""}
            </p>
          </div>
          <button
            type="button"
            onClick={() => void loadBrief(true)}
            disabled={briefLoading}
            className="shrink-0 rounded-lg border border-neutral-300 dark:border-neutral-600 px-2.5 py-1.5 text-xs font-medium text-neutral-700 dark:text-neutral-200 hover:bg-neutral-100 dark:hover:bg-neutral-800 disabled:opacity-50"
          >
            {briefLoading ? "…" : "Refresh brief"}
          </button>
        </div>

        {briefLoading && !sections && (
          <div className="space-y-3 animate-pulse">
            <div className="h-16 rounded-lg bg-neutral-200/80 dark:bg-neutral-800" />
            <div className="h-16 rounded-lg bg-neutral-200/80 dark:bg-neutral-800" />
            <div className="h-16 rounded-lg bg-neutral-200/80 dark:bg-neutral-800" />
          </div>
        )}

        {analystDown && (
          <div className="mb-3 rounded-lg border border-amber-300 dark:border-amber-700 bg-amber-50 dark:bg-amber-950/40 px-3 py-2 text-xs text-amber-900 dark:text-amber-200">
            Analyst unavailable — numbers below still come from your data.{" "}
            <button type="button" className="underline font-medium" onClick={() => void loadBrief(true)}>
              Retry
            </button>
            {briefError ? <span className="block mt-1 opacity-80">{briefError}</span> : null}
          </div>
        )}

        {!analystDown && briefError && (
          <p className="text-sm text-red-600 dark:text-red-400 mb-2">{briefError}</p>
        )}

        {sections && (
          <div className="space-y-3">
            <div className="rounded-xl border border-neutral-200 dark:border-neutral-700 p-3">
              <h3 className="text-xs font-semibold uppercase tracking-wide text-neutral-500 mb-1.5">
                Cash picture
              </h3>
              <SectionBody text={sections.cash} />
            </div>
            <div className="rounded-xl border border-neutral-200 dark:border-neutral-700 p-3">
              <h3 className="text-xs font-semibold uppercase tracking-wide text-neutral-500 mb-1.5">
                Spend reality
              </h3>
              <SectionBody text={sections.spend} />
            </div>
            <div className="rounded-xl border border-neutral-200 dark:border-neutral-700 p-3">
              <h3 className="text-xs font-semibold uppercase tracking-wide text-neutral-500 mb-1.5">
                Cut list
              </h3>
              <SectionBody text={sections.cuts} />
            </div>
          </div>
        )}
      </div>

      {snapshot && (
        <div className={getCardClasses(theme.summary)}>
          <button
            type="button"
            onClick={() => setFactsOpen((o) => !o)}
            className="w-full flex items-center justify-between text-left"
          >
            <h2 className="text-sm font-semibold text-neutral-900 dark:text-white">Facts</h2>
            <span className="text-xs text-neutral-500">{factsOpen ? "Hide" : "Show"}</span>
          </button>
          {factsOpen && (
            <div className="mt-3 space-y-3 text-sm">
              {snapshot.dataNotes.length > 0 && (
                <ul className="text-xs text-amber-800 dark:text-amber-300 list-disc pl-4">
                  {snapshot.dataNotes.map((n) => (
                    <li key={n}>{n}</li>
                  ))}
                </ul>
              )}
              <div>
                <p className="text-xs font-medium text-neutral-500 mb-1">Accounts</p>
                <ul className="space-y-1">
                  {snapshot.accounts.map((a) => (
                    <li key={a.key} className="flex justify-between gap-2 tabular-nums text-xs sm:text-sm">
                      <span>{a.label}</span>
                      <span className="text-neutral-600 dark:text-neutral-400">
                        bal {a.balance == null ? "—" : formatCurrency(a.balance)} · out −
                        {formatCurrency(a.plannedOut)} · req {formatCurrency(a.required)}
                      </span>
                    </li>
                  ))}
                </ul>
              </div>
              <div>
                <p className="text-xs font-medium text-neutral-500 mb-1">
                  Spend this cycle {formatCurrency(snapshot.spend.thisCycleOutflow)}
                  <span className="font-normal text-neutral-400">
                    {" "}
                    (prior {formatCurrency(snapshot.spend.priorCycleOutflow)})
                  </span>
                </p>
              </div>
              <div>
                <p className="text-xs font-medium text-neutral-500 mb-1">Largest upcoming bills</p>
                <ul className="space-y-1">
                  {snapshot.largeUpcomingBills.slice(0, 8).map((b) => (
                    <li
                      key={`${b.name}-${b.date}-${b.account}`}
                      className={`flex justify-between gap-2 text-xs sm:text-sm ${b.isPaid ? "line-through text-neutral-400" : ""}`}
                    >
                      <span className="truncate">
                        {b.name} · {b.date}
                      </span>
                      <span className="tabular-nums shrink-0">{formatCurrency(b.amount)}</span>
                    </li>
                  ))}
                  {snapshot.largeUpcomingBills.length === 0 && (
                    <li className="text-neutral-500 text-xs">None in window</li>
                  )}
                </ul>
              </div>
              <div>
                <p className="text-xs font-medium text-neutral-500 mb-1">Recurring / subscriptions</p>
                <ul className="space-y-1">
                  {snapshot.recurringCandidates.slice(0, 10).map((r) => (
                    <li key={`${r.source}-${r.name}`} className="flex justify-between gap-2 text-xs sm:text-sm">
                      <span className="truncate">
                        {r.name}
                        <span className="text-neutral-400">
                          {" "}
                          · {r.source === "subscription_bill" ? "bill" : `×${r.count}`}
                        </span>
                      </span>
                      <span className="tabular-nums shrink-0">
                        {formatCurrency(r.monthlyEquivalent ?? r.amount)}
                        /mo
                      </span>
                    </li>
                  ))}
                </ul>
              </div>
            </div>
          )}
        </div>
      )}

      <div className={getCardClasses(theme.summary)}>
        <h2 className="text-sm font-semibold text-neutral-900 dark:text-white mb-2">Ask</h2>
        <div className="flex flex-wrap gap-1.5 mb-3">
          {STARTER_CHIPS.map((chip) => (
            <button
              key={chip}
              type="button"
              disabled={chatBusy}
              onClick={() => void sendChat(chip)}
              className="rounded-full border border-neutral-300 dark:border-neutral-600 px-2.5 py-1 text-[11px] text-neutral-700 dark:text-neutral-300 hover:bg-neutral-100 dark:hover:bg-neutral-800 disabled:opacity-50"
            >
              {chip}
            </button>
          ))}
        </div>
        <div className="space-y-2 mb-3 max-h-64 overflow-y-auto">
          {messages.length === 0 && (
            <p className="text-xs text-neutral-500">Ask about big bills, subscriptions, or overspending.</p>
          )}
          {messages.map((m, i) => (
            <div
              key={i}
              className={`rounded-lg px-2.5 py-2 text-sm whitespace-pre-wrap ${
                m.role === "user"
                  ? "bg-sky-100 dark:bg-sky-950/50 text-sky-950 dark:text-sky-100 ml-4"
                  : "bg-neutral-100 dark:bg-neutral-800 text-neutral-800 dark:text-neutral-100 mr-4"
              }`}
            >
              {m.content}
            </div>
          ))}
        </div>
        {chatError && <p className="text-xs text-red-600 dark:text-red-400 mb-2">{chatError}</p>}
        <form
          className="flex gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            void sendChat(input);
          }}
        >
          <input
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder="Ask about your numbers…"
            className="flex-1 min-w-0 rounded-lg border border-neutral-300 dark:border-neutral-600 bg-white dark:bg-neutral-900 px-3 py-2 text-sm"
            disabled={chatBusy}
          />
          <button
            type="submit"
            disabled={chatBusy || !input.trim()}
            className="rounded-lg bg-neutral-800 dark:bg-neutral-200 text-white dark:text-neutral-900 px-3 py-2 text-sm font-medium disabled:opacity-50"
          >
            {chatBusy ? "…" : "Send"}
          </button>
        </form>
      </div>
    </div>
  );
}
