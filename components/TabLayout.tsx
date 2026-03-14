"use client";

import { useState, type ReactNode } from "react";

interface Tab {
  id: string;
  label: string;
}

const TABS: Tab[] = [
  { id: "recurring", label: "Recurring" },
  { id: "goals", label: "Goals" },
  { id: "bills", label: "Bills" },
];

export function TabLayout({
  recurringContent,
  goalsContent,
  billsContent,
}: {
  recurringContent: ReactNode;
  goalsContent: ReactNode;
  billsContent: ReactNode;
}) {
  const [activeTab, setActiveTab] = useState("recurring");

  return (
    <>
      <div className="flex gap-1 rounded-xl bg-neutral-200/80 dark:bg-neutral-800/80 p-1 mb-4">
        {TABS.map((tab) => (
          <button
            key={tab.id}
            type="button"
            onClick={() => setActiveTab(tab.id)}
            className={`flex-1 rounded-lg px-3 py-2 text-sm font-medium transition-all ${
              activeTab === tab.id
                ? "bg-white dark:bg-neutral-700 text-neutral-900 dark:text-neutral-100 shadow-sm"
                : "text-neutral-600 dark:text-neutral-400 hover:text-neutral-800 dark:hover:text-neutral-200"
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>
      <div>
        {activeTab === "recurring" && recurringContent}
        {activeTab === "goals" && goalsContent}
        {activeTab === "bills" && billsContent}
      </div>
    </>
  );
}
