"use client";

import React, { useCallback, useEffect, useRef, useState } from "react";
import type { Section } from "@/lib/types";

const SECTION_ORDER_KEY = "sectionOrder";
const LONG_PRESS_MS = 400;
const MOVE_THRESHOLD_PX = 10;

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
  const [isTouchDragging, setIsTouchDragging] = useState(false);

  const longPressTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const touchSourceIdRef = useRef<string | null>(null);
  const touchStartRef = useRef<{ x: number; y: number } | null>(null);
  const dropTargetIdRef = useRef<string | null>(null);
  dropTargetIdRef.current = dropTargetId;

  const childArray = Array.isArray(children) ? [...children] : [children];
  if (childArray.length !== sections.length) {
    console.warn("DraggableSectionCards: sections and children length mismatch");
  }

  const orderedIndices = applyOrder(sections, order);

  useEffect(() => {
    setOrder(getStoredOrder());
  }, [sections.map((s) => s.id).join(",")]);

  const reorder = useCallback(
    (sourceId: string, targetSectionId: string) => {
      if (sourceId === targetSectionId) return;
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
      if (sourceId) reorder(sourceId, targetSectionId);
    },
    [reorder]
  );

  const handleDragEnd = useCallback(() => {
    setDragId(null);
    setDropTargetId(null);
  }, []);

  const clearLongPress = useCallback(() => {
    if (longPressTimerRef.current) {
      clearTimeout(longPressTimerRef.current);
      longPressTimerRef.current = null;
    }
    touchStartRef.current = null;
  }, []);

  const handleTouchStart = useCallback(
    (e: React.TouchEvent, sectionId: string) => {
      if (e.touches.length !== 1) return;
      const touch = e.touches[0];
      touchStartRef.current = { x: touch.clientX, y: touch.clientY };
      longPressTimerRef.current = setTimeout(() => {
        longPressTimerRef.current = null;
        touchSourceIdRef.current = sectionId;
        setDragId(sectionId);
        setIsTouchDragging(true);
      }, LONG_PRESS_MS);
    },
    []
  );

  const handleTouchMove = useCallback((e: React.TouchEvent) => {
    if (!touchStartRef.current || !longPressTimerRef.current) return;
    const touch = e.touches[0];
    const dx = touch.clientX - touchStartRef.current.x;
    const dy = touch.clientY - touchStartRef.current.y;
    if (Math.abs(dx) > MOVE_THRESHOLD_PX || Math.abs(dy) > MOVE_THRESHOLD_PX) {
      clearLongPress();
    }
  }, [clearLongPress]);

  useEffect(() => {
    if (!isTouchDragging) return;
    const onMove = (e: TouchEvent) => {
      e.preventDefault();
      if (e.touches.length !== 1) return;
      const touch = e.touches[0];
      const el = document.elementFromPoint(touch.clientX, touch.clientY);
      const wrapper = el?.closest?.("[data-section-id]");
      const id = wrapper?.getAttribute?.("data-section-id");
      if (id) setDropTargetId(id);
    };
    const onEnd = () => {
      const sourceId = touchSourceIdRef.current;
      const targetId = dropTargetIdRef.current;
      if (sourceId && targetId) reorder(sourceId, targetId);
      touchSourceIdRef.current = null;
      setDragId(null);
      setDropTargetId(null);
      setIsTouchDragging(false);
    };
    document.addEventListener("touchmove", onMove, { passive: false });
    document.addEventListener("touchend", onEnd);
    document.addEventListener("touchcancel", onEnd);
    return () => {
      document.removeEventListener("touchmove", onMove);
      document.removeEventListener("touchend", onEnd);
      document.removeEventListener("touchcancel", onEnd);
    };
  }, [isTouchDragging, reorder]);

  useEffect(() => {
    return clearLongPress;
  }, [clearLongPress]);

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
            data-section-id={section.id}
            draggable
            onDragStart={(e) => handleDragStart(e, section.id)}
            onDragOver={(e) => handleDragOver(e, section.id)}
            onDragLeave={handleDragLeave}
            onDrop={(e) => handleDrop(e, section.id)}
            onDragEnd={handleDragEnd}
            onTouchStart={(e) => handleTouchStart(e, section.id)}
            onTouchMove={handleTouchMove}
            onTouchEnd={clearLongPress}
            onTouchCancel={clearLongPress}
            className={`relative transition-all select-none cursor-grab active:cursor-grabbing touch-manipulation ${isDragging ? "opacity-60 scale-[0.98]" : ""} ${
              isDropTarget ? "ring-2 ring-sky-500 dark:ring-sky-400 ring-offset-2 ring-offset-neutral-100 dark:ring-offset-neutral-900 rounded-xl" : ""
            }`}
            aria-label="Hold or drag to reorder"
            title="Hold or drag to reorder"
          >
            {child}
          </div>
        );
      })}
    </div>
  );
}
