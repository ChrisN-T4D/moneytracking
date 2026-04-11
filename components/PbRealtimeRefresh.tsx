"use client";

import { useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import PocketBase from "pocketbase";

/** Collections that affect Check-In (mark paid), Goals, and Bills after writes. */
const REALTIME_COLLECTIONS = [
  "bills",
  "spanish_fork_bills",
  "statements",
  "goals",
] as const;

function clientPbBaseUrl(): string {
  const u = process.env.NEXT_PUBLIC_POCKETBASE_URL ?? "";
  if (!u) return "";
  const b = u.replace(/\/$/, "");
  return b.endsWith("/_") ? b.replace(/\/_\/?$/, "") || b : b;
}

/**
 * Subscribes to PocketBase Realtime for shared collections and calls router.refresh()
 * when any record changes, so all signed-in users see mark paid / unmark without manual reload.
 */
export function PbRealtimeRefresh() {
  const router = useRouter();
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    const base = clientPbBaseUrl();
    if (!base || typeof window === "undefined") return;

    const scheduleRefresh = () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
      debounceRef.current = setTimeout(() => {
        debounceRef.current = null;
        router.refresh();
      }, 400);
    };

    let cancelled = false;
    const unsubscribeFns: Array<() => void | Promise<void>> = [];

    (async () => {
      let realtimeOk = false;
      try {
        const res = await fetch("/api/auth/pb-token", { credentials: "include" });
        if (!res.ok || cancelled) {
          /* fall through to polling */
        } else {
          const data = (await res.json()) as { token?: string };
          const token = data.token?.trim();
          if (token && !cancelled) {
            const pb = new PocketBase(base);
            pb.authStore.save(token);
            for (const name of REALTIME_COLLECTIONS) {
              try {
                const unsub = await pb.collection(name).subscribe("*", () => {
                  if (!cancelled) scheduleRefresh();
                });
                unsubscribeFns.push(unsub);
                realtimeOk = true;
              } catch {
                /* collection missing or no subscribe rule — skip */
              }
            }
          }
        }
      } catch {
        /* network */
      }

      if (!realtimeOk && !cancelled) {
        pollRef.current = setInterval(() => {
          if (document.visibilityState === "visible") scheduleRefresh();
        }, 50_000);
      }
    })();

    return () => {
      cancelled = true;
      if (debounceRef.current) clearTimeout(debounceRef.current);
      if (pollRef.current) clearInterval(pollRef.current);
      for (const fn of unsubscribeFns) {
        try {
          void fn();
        } catch {
          /* */
        }
      }
    };
  }, [router]);

  return null;
}
