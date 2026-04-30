"use client";

import {
  createContext,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from "react";
import type { MoneyGoal } from "@/lib/types";

export type GoalTransaction = {
  id: string;
  date: string;
  description: string;
  amount: number;
};

interface GoalsContextValue {
  goals: MoneyGoal[];
  setGoals: React.Dispatch<React.SetStateAction<MoneyGoal[]>>;
  updateGoalContribution: (id: string, amount: number | null) => void;
  totalMonthlyContributions: number;
  goalStatementsById: Map<string, GoalTransaction[]>;
}

const GoalsContext = createContext<GoalsContextValue | null>(null);

/** Must match GoalsSection handleDelete — only seed goals (g1, g2, …) use deletedStaticGoals. */
function isStaticSeedGoalId(id: string): boolean {
  return id.length < 10 || /^g\d+$/.test(id);
}

function safeDeletedIds(): string[] {
  try {
    return JSON.parse(
      localStorage.getItem("deletedStaticGoals") || "[]"
    ) as string[];
  } catch {
    return [];
  }
}

function filterVisibleGoals(list: MoneyGoal[]): MoneyGoal[] {
  const deleted = safeDeletedIds();
  return list.filter(
    (g) => !isStaticSeedGoalId(g.id) || !deleted.includes(g.id)
  );
}

const MANUAL_GOAL_DELTA_KEY = "moneytracking_goalManualProgressDelta";

function getStoredManualProgressDelta(goalId: string): number {
  try {
    const raw = localStorage.getItem(MANUAL_GOAL_DELTA_KEY);
    if (!raw) return 0;
    const map = JSON.parse(raw) as Record<string, number>;
    const n = Number(map[goalId]);
    return Number.isFinite(n) && n > 0 ? n : 0;
  } catch {
    return 0;
  }
}

/** Persist extra goal progress the app cannot tag from statements. */
export function addStoredManualProgressDelta(goalId: string, delta: number): void {
  if (!goalId || !Number.isFinite(delta) || delta === 0) return;
  try {
    const raw = localStorage.getItem(MANUAL_GOAL_DELTA_KEY);
    const map: Record<string, number> = raw ? (JSON.parse(raw) as Record<string, number>) : {};
    const prev = Number(map[goalId]) || 0;
    map[goalId] = Math.max(0, prev + delta);
    localStorage.setItem(MANUAL_GOAL_DELTA_KEY, JSON.stringify(map));
  } catch {
    /* ignore */
  }
}

function normalizeStatementsMap(
  raw:
    | Map<string, GoalTransaction[]>
    | Record<string, GoalTransaction[]>
    | undefined
): Map<string, GoalTransaction[]> {
  if (!raw) return new Map();
  if (raw instanceof Map) return raw;
  if (typeof raw === "object") {
    return new Map(
      Object.entries(raw).filter(([, v]) => Array.isArray(v))
    );
  }
  return new Map();
}

export function GoalsProvider({
  initialGoals,
  goalStatementsById: rawStatements,
  children,
}: {
  initialGoals: MoneyGoal[];
  goalStatementsById?:
    | Map<string, GoalTransaction[]>
    | Record<string, GoalTransaction[]>;
  children: ReactNode;
}) {
  const [goals, setGoals] = useState<MoneyGoal[]>(() => {
    return filterVisibleGoals(initialGoals)
      .map((g) => ({
        ...g,
        currentAmount: g.currentAmount + getStoredManualProgressDelta(g.id),
      }));
  });

  // Merge server goals on every refresh (router.refresh() triggers new initialGoals prop)
  useEffect(() => {
    setGoals((prev) =>
      filterVisibleGoals(initialGoals).map((g) => {
        const local = prev.find((p) => p.id === g.id);
        const manualDelta = getStoredManualProgressDelta(g.id);
        return {
          ...g,
          monthlyContribution:
            local?.monthlyContribution ?? g.monthlyContribution,
          currentAmount: g.currentAmount + manualDelta,
        };
      })
    );
  }, [initialGoals]);

  const goalStatementsById = normalizeStatementsMap(rawStatements);

  function updateGoalContribution(id: string, amount: number | null) {
    setGoals((prev) =>
      prev.map((g) =>
        g.id === id ? { ...g, monthlyContribution: amount } : g
      )
    );
  }

  const totalMonthlyContributions = goals.reduce(
    (sum, g) => sum + (g.monthlyContribution ?? 0),
    0
  );

  return (
    <GoalsContext.Provider
      value={{
        goals,
        setGoals,
        updateGoalContribution,
        totalMonthlyContributions,
        goalStatementsById,
      }}
    >
      {children}
    </GoalsContext.Provider>
  );
}

export function useGoals() {
  const ctx = useContext(GoalsContext);
  if (!ctx) throw new Error("useGoals must be used inside GoalsProvider");
  return ctx;
}
