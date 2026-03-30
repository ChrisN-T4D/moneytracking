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
    const deleted = safeDeletedIds();
    return initialGoals.filter((g) => !deleted.includes(g.id));
  });

  // Merge server goals on every refresh (router.refresh() triggers new initialGoals prop)
  useEffect(() => {
    const deleted = safeDeletedIds();
    setGoals((prev) =>
      initialGoals
        .filter((g) => !deleted.includes(g.id))
        .map((g) => {
          const local = prev.find((p) => p.id === g.id);
          return {
            ...g,
            monthlyContribution:
              local?.monthlyContribution ?? g.monthlyContribution,
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

function safeDeletedIds(): string[] {
  try {
    return JSON.parse(
      localStorage.getItem("deletedStaticGoals") || "[]"
    ) as string[];
  } catch {
    return [];
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
