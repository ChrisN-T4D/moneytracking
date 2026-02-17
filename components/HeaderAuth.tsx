"use client";

import { useState } from "react";
import { useAuth } from "./AuthProvider";

export function HeaderAuth() {
  const { user, loading, login, logout } = useAuth();
  const [open, setOpen] = useState(false);
  const [identity, setIdentity] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setSubmitting(true);
    try {
      const result = await login(identity, password);
      if (result.ok) {
        setOpen(false);
        setIdentity("");
        setPassword("");
      } else {
        setError(result.message ?? "Login failed.");
      }
    } finally {
      setSubmitting(false);
    }
  }

  async function handleLogout() {
    await logout();
  }

  if (loading) {
    return (
      <span className="text-xs text-neutral-400 dark:text-neutral-500">
        …
      </span>
    );
  }

  if (user) {
    return (
      <div className="flex items-center gap-2">
        <span className="text-xs text-neutral-600 dark:text-neutral-400 truncate max-w-[120px]" title={user.email}>
          {user.email || user.name || user.username || "Signed in"}
        </span>
        <button
          type="button"
          onClick={handleLogout}
          className="text-xs font-medium text-neutral-500 dark:text-neutral-400 hover:text-neutral-700 dark:hover:text-neutral-200"
        >
          Log out
        </button>
      </div>
    );
  }

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="text-sm font-medium text-neutral-600 dark:text-neutral-400 hover:text-neutral-900 dark:hover:text-neutral-100"
      >
        Log in
      </button>

      {open && (
        <div
          className="fixed inset-0 z-50 flex min-h-screen items-center justify-center bg-neutral-950/60 px-4 backdrop-blur-sm"
          onClick={() => setOpen(false)}
        >
          <div
            className="w-full max-w-sm rounded-2xl border border-neutral-200/70 bg-white p-4 shadow-xl dark:border-neutral-800 dark:bg-neutral-900"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="mb-3 flex items-center justify-between">
              <h2 className="text-sm font-semibold text-neutral-900 dark:text-neutral-100">
                Log in
              </h2>
              <button
                type="button"
                onClick={() => setOpen(false)}
                className="rounded p-1.5 text-neutral-500 hover:bg-neutral-100 hover:text-neutral-700 dark:hover:bg-neutral-800 dark:hover:text-neutral-200"
                aria-label="Close"
              >
                <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>

            <p className="mb-3 text-xs text-neutral-500 dark:text-neutral-400">
              Sign in with your PocketBase user. Your theme preferences will sync to your profile.
            </p>

            <form onSubmit={handleSubmit} className="space-y-3">
              <div>
                <label htmlFor="auth-identity" className="block text-xs font-medium text-neutral-700 dark:text-neutral-300">
                  Email or username
                </label>
                <input
                  id="auth-identity"
                  type="text"
                  autoComplete="username"
                  value={identity}
                  onChange={(e) => setIdentity(e.target.value)}
                  className="mt-1 w-full rounded-lg border border-neutral-300 bg-white px-3 py-2 text-sm text-neutral-900 placeholder:text-neutral-400 dark:border-neutral-600 dark:bg-neutral-800 dark:text-neutral-100"
                  placeholder="you@example.com"
                  required
                />
              </div>
              <div>
                <label htmlFor="auth-password" className="block text-xs font-medium text-neutral-700 dark:text-neutral-300">
                  Password
                </label>
                <input
                  id="auth-password"
                  type="password"
                  autoComplete="current-password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="mt-1 w-full rounded-lg border border-neutral-300 bg-white px-3 py-2 text-sm text-neutral-900 dark:border-neutral-600 dark:bg-neutral-800 dark:text-neutral-100"
                  required
                />
              </div>
              {error && (
                <p className="text-xs text-red-600 dark:text-red-400">{error}</p>
              )}
              <button
                type="submit"
                disabled={submitting}
                className="w-full rounded-lg bg-sky-600 py-2 text-sm font-medium text-white hover:bg-sky-500 disabled:opacity-50"
              >
                {submitting ? "Signing in…" : "Sign in"}
              </button>
            </form>
          </div>
        </div>
      )}
    </>
  );
}
