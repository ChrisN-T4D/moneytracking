"use client";

import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from "react";
import { useAuth } from "./AuthProvider";
import { PALETTE_IDS, type PaletteId } from "@/lib/themePalettes";

export interface ThemeState {
  summary: PaletteId;
  paychecks: PaletteId;
  bills: PaletteId;
  spanishFork: PaletteId;
  autoTransfers: PaletteId;
}

interface ThemeContextValue {
  theme: ThemeState;
  setTheme: (next: ThemeState) => void;
  updateSection: (section: keyof ThemeState, palette: PaletteId) => void;
}

const defaultTheme: ThemeState = {
  summary: "default",
  paychecks: "default",
  bills: "default",
  spanishFork: "default",
  autoTransfers: "default",
};

const ThemeContext = createContext<ThemeContextValue | undefined>(undefined);

const STORAGE_KEY = "neu-money-theme";

function parseThemeFromProfile(theme: Record<string, string> | null): ThemeState | null {
  if (!theme || typeof theme !== "object") return null;
  const p = (v: unknown): PaletteId => {
    if (v === "mint") return "emerald";
    if (v === "sunset") return "amber";
    return PALETTE_IDS.includes(v as PaletteId) ? (v as PaletteId) : "default";
  };
  return {
    summary: p(theme.summary),
    paychecks: p(theme.paychecks),
    bills: p(theme.bills),
    spanishFork: p(theme.spanishFork),
    autoTransfers: p(theme.autoTransfers),
  };
}

export function ThemeProvider({ children }: { children: ReactNode }) {
  const { user, themeFromProfile } = useAuth();
  const [theme, setTheme] = useState<ThemeState>(defaultTheme);
  const saveTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Load from profile when logged in and profile has theme; otherwise from localStorage
  useEffect(() => {
    const fromProfile = parseThemeFromProfile(themeFromProfile);
    if (fromProfile) {
      setTheme((prev) => ({ ...defaultTheme, ...prev, ...fromProfile }));
      return;
    }
    try {
      const stored = window.localStorage.getItem(STORAGE_KEY);
      if (stored) {
        const parsed = JSON.parse(stored) as Partial<ThemeState>;
        setTheme((prev) => ({ ...defaultTheme, ...prev, ...parsed }));
      }
    } catch {
      // ignore
    }
  }, [themeFromProfile]);

  // When profile theme arrives after login, merge into state
  useEffect(() => {
    if (!user) return;
    const fromProfile = parseThemeFromProfile(themeFromProfile);
    if (fromProfile) setTheme((prev) => ({ ...prev, ...fromProfile }));
  }, [user, themeFromProfile]);

  // Persist: localStorage when not logged in; profile when logged in (debounced)
  useEffect(() => {
    try {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(theme));
    } catch {
      // ignore
    }
  }, [theme]);

  const saveProfileTheme = useCallback((next: ThemeState) => {
    if (!user) return;
    if (saveTimeoutRef.current) clearTimeout(saveTimeoutRef.current);
    saveTimeoutRef.current = setTimeout(async () => {
      saveTimeoutRef.current = null;
      try {
        await fetch("/api/profile", {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            theme: {
              summary: next.summary,
              paychecks: next.paychecks,
              bills: next.bills,
              spanishFork: next.spanishFork,
              autoTransfers: next.autoTransfers,
            },
          }),
          credentials: "include",
        });
      } catch {
        // ignore
      }
    }, 500);
  }, [user]);

  useEffect(() => {
    if (user) saveProfileTheme(theme);
    return () => {
      if (saveTimeoutRef.current) clearTimeout(saveTimeoutRef.current);
    };
  }, [user, theme, saveProfileTheme]);

  const updateSection = useCallback((section: keyof ThemeState, palette: PaletteId) => {
    setTheme((prev) => ({ ...prev, [section]: palette }));
  }, []);

  return (
    <ThemeContext.Provider value={{ theme, setTheme, updateSection }}>
      {children}
    </ThemeContext.Provider>
  );
}

export function useTheme() {
  const ctx = useContext(ThemeContext);
  if (!ctx) {
    throw new Error("useTheme must be used within ThemeProvider");
  }
  return ctx;
}
