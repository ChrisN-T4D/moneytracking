"use client";

import { Fragment, useState, type ReactNode } from "react";

interface Tab {
  id: string;
  label: string;
}

const TABS: Tab[] = [
  { id: "checkin", label: "Check-In" },
  { id: "goals", label: "Goals" },
  { id: "bills", label: "Bills" },
];

export function TabLayout({
  checkinContent,
  goalsContent,
  billsContent,
}: {
  checkinContent: ReactNode;
  goalsContent: ReactNode;
  billsContent: ReactNode;
}) {
  const [activeTab, setActiveTab] = useState("checkin");

  return (
    <>
      <div className="flex gap-1 rounded-xl bg-neutral-200/80 dark:bg-neutral-800/80 p-1 mb-4 overflow-x-auto">
        {TABS.map((tab) => (
          <button
            key={tab.id}
            type="button"
            onClick={() => setActiveTab(tab.id)}
            className={`flex-1 min-w-0 rounded-lg px-2 sm:px-3 py-2 text-xs sm:text-sm font-medium transition-all shrink-0 ${
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
        {activeTab === "checkin" && <Fragment key="checkin">{checkinContent}</Fragment>}
        {activeTab === "goals" && <Fragment key="goals">{goalsContent}</Fragment>}
        {activeTab === "bills" && <Fragment key="bills">{billsContent}</Fragment>}
      </div>
    </>
  );
}
