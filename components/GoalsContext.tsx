"use client";

import { createContext, useContext, useState, type ReactNode } from "react";
import type { MoneyGoal } from "@/lib/types";

interface GoalsContextValue {
  goals: MoneyGoal[];
  setGoals: React.Dispatch<React.SetStateAction<MoneyGoal[]>>;
  updateGoalContribution: (id: string, amount: number | null) => void;
  totalMonthlyContributions: number;
}

const GoalsContext = createContext<GoalsContextValue | null>(null);

export function GoalsProvider({
  initialGoals,
  children,
}: {
  initialGoals: MoneyGoal[];
  children: ReactNode;
}) {
  const [goals, setGoals] = useState<MoneyGoal[]>(() => {
    try {
      const deleted = JSON.parse(
        localStorage.getItem("deletedStaticGoals") || "[]"
      ) as string[];
      return initialGoals.filter((g) => !deleted.includes(g.id));
    } catch {
      return initialGoals;
    }
  });

  function updateGoalContribution(id: string, amount: number | null) {
    setGoals((prev) =>
      prev.map((g) => (g.id === id ? { ...g, monthlyContribution: amount } : g))
    );
  }

  const totalMonthlyContributions = goals.reduce(
    (sum, g) => sum + (g.monthlyContribution ?? 0),
    0
  );

  return (
    <GoalsContext.Provider
      value={{ goals, setGoals, updateGoalContribution, totalMonthlyContributions }}
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
