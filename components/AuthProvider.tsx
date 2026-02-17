"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from "react";

export interface AuthUser {
  id: string;
  email: string;
  name: string;
  username: string;
}

export interface ThemeState {
  summary: string;
  paychecks: string;
  bills: string;
  spanishFork: string;
  autoTransfers: string;
}

interface AuthContextValue {
  user: AuthUser | null;
  themeFromProfile: ThemeState | null;
  loading: boolean;
  login: (identity: string, password: string) => Promise<{ ok: boolean; message?: string }>;
  logout: () => Promise<void>;
  refreshMe: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [themeFromProfile, setThemeFromProfile] = useState<ThemeState | null>(null);
  const [loading, setLoading] = useState(true);

  const refreshMe = useCallback(async () => {
    try {
      const res = await fetch("/api/auth/me", { credentials: "include" });
      const data = (await res.json()) as {
        ok?: boolean;
        user?: AuthUser | null;
        theme?: ThemeState | null;
      };
      setUser(data.user ?? null);
      setThemeFromProfile(data.theme ?? null);
    } catch {
      setUser(null);
      setThemeFromProfile(null);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    refreshMe();
  }, [refreshMe]);

  const login = useCallback(
    async (identity: string, password: string): Promise<{ ok: boolean; message?: string }> => {
      try {
        const res = await fetch("/api/auth/login", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ identity: identity.trim(), password }),
          credentials: "include",
        });
        const data = (await res.json()) as {
          ok?: boolean;
          message?: string;
          user?: AuthUser;
        };
        if (data.ok && data.user) {
          setUser(data.user);
          setThemeFromProfile(null);
          await refreshMe();
          return { ok: true };
        }
        return { ok: false, message: data.message ?? "Login failed." };
      } catch (err) {
        return {
          ok: false,
          message: err instanceof Error ? err.message : "Login failed.",
        };
      }
    },
    [refreshMe]
  );

  const logout = useCallback(async () => {
    try {
      await fetch("/api/auth/logout", { method: "POST", credentials: "include" });
    } finally {
      setUser(null);
      setThemeFromProfile(null);
    }
  }, []);

  return (
    <AuthContext.Provider
      value={{
        user,
        themeFromProfile,
        loading,
        login,
        logout,
        refreshMe,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) {
    throw new Error("useAuth must be used within AuthProvider");
  }
  return ctx;
}
