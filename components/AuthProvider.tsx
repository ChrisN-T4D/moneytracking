"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
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
  signup: (email: string, password: string, passwordConfirm: string, name?: string) => Promise<{ ok: boolean; message?: string }>;
  logout: () => Promise<void>;
  refreshMe: () => Promise<void>;
  /** Update current user with partial fields (e.g. after profile save). */
  updateUser: (partial: Partial<AuthUser>) => void;
}

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [themeFromProfile, setThemeFromProfile] = useState<ThemeState | null>(null);
  const [loading, setLoading] = useState(true);
  const hasLoggedInRef = useRef(false);

  const refreshMe = useCallback(async (preserveUser = false) => {
    try {
      const res = await fetch("/api/auth/me", { 
        credentials: "include",
        cache: "no-store",
      });
      const data = (await res.json()) as {
        ok?: boolean;
        user?: AuthUser | null;
        theme?: ThemeState | null;
      };
      if (data.ok !== false && data.user) {
        setUser(data.user);
        setThemeFromProfile(data.theme ?? null);
        hasLoggedInRef.current = true;
      } else {
        // Only clear user if preserveUser is false AND we haven't logged in this session
        // On initial load (preserveUser=true), don't clear - wait for explicit logout
        if (!preserveUser && !hasLoggedInRef.current) {
          setUser(null);
          setThemeFromProfile(null);
        }
      }
    } catch (err) {
      console.error("Auth refresh failed:", err);
      // On initial load (preserveUser=true), don't clear user on error - might be temporary network issue
      // Only clear if preserveUser is false AND we haven't logged in this session
      if (!preserveUser && !hasLoggedInRef.current) {
        setUser(null);
        setThemeFromProfile(null);
      }
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    // Initial load: restore user from cookie
    // Use preserveUser=false so we clear if cookie is invalid, but only after refresh completes
    refreshMe(false);
  }, [refreshMe]);

  const login = useCallback(
    async (identity: string, password: string): Promise<{ ok: boolean; message?: string }> => {
      try {
        const res = await fetch("/api/auth/login", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ identity: identity.trim(), password }),
          credentials: "include",
          cache: "no-store",
        });
        const data = (await res.json()) as {
          ok?: boolean;
          message?: string;
          user?: AuthUser;
        };
        if (data.ok && data.user) {
          // Set user immediately from login response
          setUser(data.user);
          setThemeFromProfile(null);
          setLoading(false);
          hasLoggedInRef.current = true;
          // Wait a bit for cookie to be set, then refresh in background to get theme preferences
          setTimeout(() => {
            refreshMe(true).catch(() => {
              // Ignore errors, user is already logged in
            });
          }, 500);
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

  const signup = useCallback(
    async (email: string, password: string, passwordConfirm: string, name?: string): Promise<{ ok: boolean; message?: string }> => {
      try {
        const res = await fetch("/api/auth/signup", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            email: email.trim(),
            password,
            passwordConfirm,
            name: name?.trim(),
          }),
          credentials: "include",
        });
        const data = (await res.json()) as {
          ok?: boolean;
          message?: string;
          user?: AuthUser;
        };
        if (data.ok && data.user) {
          // Set user immediately from signup response
          setUser(data.user);
          setThemeFromProfile(null);
          setLoading(false);
          hasLoggedInRef.current = true;
          // Wait a bit for cookie to be set, then refresh in background to get theme preferences
          setTimeout(() => {
            refreshMe(true).catch(() => {
              // Ignore errors, user is already logged in
            });
          }, 500);
          return { ok: true };
        }
        return { ok: false, message: data.message ?? "Sign up failed." };
      } catch (err) {
        return {
          ok: false,
          message: err instanceof Error ? err.message : "Sign up failed.",
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
      hasLoggedInRef.current = false;
    }
  }, []);

  const updateUser = useCallback((partial: Partial<AuthUser>) => {
    setUser((prev) => (prev ? { ...prev, ...partial } : null));
  }, []);

  return (
    <AuthContext.Provider
      value={{
        user,
        themeFromProfile,
        loading,
        login,
        signup,
        logout,
        refreshMe,
        updateUser,
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
