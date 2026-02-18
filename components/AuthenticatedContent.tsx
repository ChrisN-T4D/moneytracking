"use client";

import { useAuth } from "./AuthProvider";
import { LandingPage } from "./LandingPage";
import type { ReactNode } from "react";

export function AuthenticatedContent({ children }: { children: ReactNode }) {
  const { user, loading } = useAuth();

  // Show loading state only on initial load, not after login
  if (loading && !user) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <span className="text-neutral-400">Loading…</span>
      </div>
    );
  }

  if (!user) {
    return <LandingPage />;
  }

  return <>{children}</>;
}
