"use client";

import React, { useCallback, useEffect, useState } from "react";
import type { Section } from "@/lib/types";

const SECTION_ORDER_KEY = "sectionOrder";

function getStoredOrder(): string[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(SECTION_ORDER_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as unknown;
    return Array.isArray(parsed) ? parsed.filter((x): x is string => typeof x === "string") : [];
  } catch {
    return [];
  }
}

function saveOrder(ids: string[]) {
  try {
    window.localStorage.setItem(SECTION_ORDER_KEY, JSON.stringify(ids));
  } catch {
    // ignore
  }
}

/** Apply user's saved order to sections (and matching children). Sections not in order go at end. */
function applyOrder(sections: Section[], order: string[]): number[] {
  const idToIndex = new Map(sections.map((s, i) => [s.id, i]));
  const ordered: number[] = [];
  const used = new Set<number>();
  for (const id of order) {
    const i = idToIndex.get(id);
    if (i !== undefined && !used.has(i)) {
      ordered.push(i);
      used.add(i);
    }
  }
  for (let i = 0; i < sections.length; i++) {
    if (!used.has(i)) ordered.push(i);
  }
  return ordered;
}

export interface DraggableSectionCardsProps {
  sections: Section[];
  children: React.ReactNode;
}

export function DraggableSectionCards({ sections, children }: DraggableSectionCardsProps) {
  const [order, setOrder] = useState<string[]>(() => getStoredOrder());
  const [dragId, setDragId] = useState<string | null>(null);
  const [dropTargetId, setDropTargetId] = useState<string | null>(null);

  const childArray = Array.isArray(children) ? [...children] : [children];
  if (childArray.length !== sections.length) {
    console.warn("DraggableSectionCards: sections and children length mismatch");
  }

  const orderedIndices = applyOrder(sections, order);

  useEffect(() => {
    setOrder(getStoredOrder());
  }, [sections.map((s) => s.id).join(",")]);

  const handleDragStart = useCallback((e: React.DragEvent, sectionId: string) => {
    setDragId(sectionId);
    e.dataTransfer.effectAllowed = "move";
    e.dataTransfer.setData("text/plain", sectionId);
    e.dataTransfer.setData("application/x-section-id", sectionId);
  }, []);

  const handleDragOver = useCallback((e: React.DragEvent, sectionId: string) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = "move";
    if (dragId && dragId !== sectionId) setDropTargetId(sectionId);
  }, [dragId]);

  const handleDragLeave = useCallback(() => {
    setDropTargetId(null);
  }, []);

  const handleDrop = useCallback(
    (e: React.DragEvent, targetSectionId: string) => {
      e.preventDefault();
      setDropTargetId(null);
      const sourceId = e.dataTransfer.getData("application/x-section-id") || e.dataTransfer.getData("text/plain");
      if (!sourceId || sourceId === targetSectionId) return;

      const currentOrder = order.length > 0 ? order : sections.map((s) => s.id);
      const srcIdx = currentOrder.indexOf(sourceId);
      const tgtIdx = currentOrder.indexOf(targetSectionId);
      if (srcIdx === -1 || tgtIdx === -1) return;

      const next = [...currentOrder];
      next.splice(srcIdx, 1);
      next.splice(tgtIdx, 0, sourceId);
      setOrder(next);
      saveOrder(next);
    },
    [order, sections]
  );

  const handleDragEnd = useCallback(() => {
    setDragId(null);
    setDropTargetId(null);
  }, []);

  return (
    <div className="space-y-6">
      {orderedIndices.map((idx) => {
        const section = sections[idx];
        const child = childArray[idx];
        if (!section || child == null) return null;
        const isDragging = dragId === section.id;
        const isDropTarget = dropTargetId === section.id;
        return (
          <div
            key={section.id}
            draggable
            onDragStart={(e) => handleDragStart(e, section.id)}
            onDragOver={(e) => handleDragOver(e, section.id)}
            onDragLeave={handleDragLeave}
            onDrop={(e) => handleDrop(e, section.id)}
            onDragEnd={handleDragEnd}
            className={`relative transition-all ${isDragging ? "opacity-60 scale-[0.98]" : ""} ${
              isDropTarget ? "ring-2 ring-sky-500 dark:ring-sky-400 ring-offset-2 ring-offset-neutral-100 dark:ring-offset-neutral-900 rounded-xl" : ""
            }`}
          >
            <div
              className="absolute left-0 top-4 z-10 cursor-grab active:cursor-grabbing touch-none text-neutral-400 hover:text-neutral-600 dark:hover:text-neutral-300 p-1 rounded -translate-x-1"
              aria-label="Drag to reorder"
              title="Drag to reorder"
            >
              <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <circle cx="9" cy="5" r="1.5" />
                <circle cx="9" cy="12" r="1.5" />
                <circle cx="9" cy="19" r="1.5" />
                <circle cx="15" cy="5" r="1.5" />
                <circle cx="15" cy="12" r="1.5" />
                <circle cx="15" cy="19" r="1.5" />
              </svg>
            </div>
            <div className="pl-8">{child}</div>
          </div>
        );
      })}
    </div>
  );
}
