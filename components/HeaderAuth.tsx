"use client";

import { useState } from "react";
import { useAuth } from "./AuthProvider";

export function HeaderAuth() {
  const { user, loading, login, signup, logout } = useAuth();
  const [open, setOpen] = useState(false);
  const [mode, setMode] = useState<"login" | "signup">("login");
  const [identity, setIdentity] = useState("");
  const [email, setEmail] = useState("");
  const [name, setName] = useState("");
  const [password, setPassword] = useState("");
  const [passwordConfirm, setPasswordConfirm] = useState("");
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setSubmitting(true);
    try {
      if (mode === "login") {
        const result = await login(identity, password);
        if (result.ok) {
          setOpen(false);
          setIdentity("");
          setPassword("");
        } else {
          setError(result.message ?? "Login failed.");
        }
      } else {
        const result = await signup(email, password, passwordConfirm, name);
        if (result.ok) {
          setOpen(false);
          setEmail("");
          setName("");
          setPassword("");
          setPasswordConfirm("");
        } else {
          setError(result.message ?? "Sign up failed.");
        }
      }
    } finally {
      setSubmitting(false);
    }
  }

  function resetForm() {
    setIdentity("");
    setEmail("");
    setName("");
    setPassword("");
    setPasswordConfirm("");
    setError("");
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
        <span className="text-xs text-neutral-600 dark:text-neutral-400 truncate max-w-[120px]" title={user.name ? `${user.name} (${user.email})` : user.email}>
          {user.name || user.email || user.username || "Signed in"}
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
        className="rounded-lg bg-sky-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-sky-500 dark:bg-sky-500 dark:hover:bg-sky-400"
      >
        Log in
      </button>

      {open && (
        <div
          className="fixed inset-0 z-50 flex min-h-screen items-center justify-center bg-neutral-950/60 px-4 backdrop-blur-sm"
          onClick={() => {
            setOpen(false);
            resetForm();
          }}
        >
          <div
            className="w-full max-w-sm rounded-2xl border border-neutral-200/70 bg-white p-4 shadow-xl dark:border-neutral-800 dark:bg-neutral-900"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="mb-3 flex items-center justify-between">
              <h2 className="text-sm font-semibold text-neutral-900 dark:text-neutral-100">
                {mode === "login" ? "Log in" : "Sign up"}
              </h2>
              <button
                type="button"
                onClick={() => {
                  setOpen(false);
                  resetForm();
                }}
                className="rounded p-1.5 text-neutral-500 hover:bg-neutral-100 hover:text-neutral-700 dark:hover:bg-neutral-800 dark:hover:text-neutral-200"
                aria-label="Close"
              >
                <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>

            {/* Toggle between login and signup */}
            <div className="mb-3 flex gap-2 rounded-lg bg-neutral-100 p-1 dark:bg-neutral-800">
              <button
                type="button"
                onClick={() => {
                  setMode("login");
                  resetForm();
                }}
                className={`flex-1 rounded px-2 py-1 text-xs font-medium transition-colors ${
                  mode === "login"
                    ? "bg-white text-neutral-900 shadow-sm dark:bg-neutral-700 dark:text-neutral-100"
                    : "text-neutral-600 hover:text-neutral-900 dark:text-neutral-400 dark:hover:text-neutral-100"
                }`}
              >
                Log in
              </button>
              <button
                type="button"
                onClick={() => {
                  setMode("signup");
                  resetForm();
                }}
                className={`flex-1 rounded px-2 py-1 text-xs font-medium transition-colors ${
                  mode === "signup"
                    ? "bg-white text-neutral-900 shadow-sm dark:bg-neutral-700 dark:text-neutral-100"
                    : "text-neutral-600 hover:text-neutral-900 dark:text-neutral-400 dark:hover:text-neutral-100"
                }`}
              >
                Sign up
              </button>
            </div>

            <p className="mb-3 text-xs text-neutral-500 dark:text-neutral-400">
              {mode === "login"
                ? "Sign in with your PocketBase user. Your theme preferences will sync to your profile."
                : "Create a new account. Your theme preferences will sync to your profile."}
            </p>

            <form onSubmit={handleSubmit} className="space-y-3">
              {mode === "login" ? (
                <>
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
                </>
              ) : (
                <>
                  <div>
                    <label htmlFor="auth-email" className="block text-xs font-medium text-neutral-700 dark:text-neutral-300">
                      Email
                    </label>
                    <input
                      id="auth-email"
                      type="email"
                      autoComplete="email"
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      className="mt-1 w-full rounded-lg border border-neutral-300 bg-white px-3 py-2 text-sm text-neutral-900 placeholder:text-neutral-400 dark:border-neutral-600 dark:bg-neutral-800 dark:text-neutral-100"
                      placeholder="you@example.com"
                      required
                    />
                  </div>
                  <div>
                    <label htmlFor="auth-name" className="block text-xs font-medium text-neutral-700 dark:text-neutral-300">
                      Name (optional)
                    </label>
                    <input
                      id="auth-name"
                      type="text"
                      autoComplete="name"
                      value={name}
                      onChange={(e) => setName(e.target.value)}
                      className="mt-1 w-full rounded-lg border border-neutral-300 bg-white px-3 py-2 text-sm text-neutral-900 placeholder:text-neutral-400 dark:border-neutral-600 dark:bg-neutral-800 dark:text-neutral-100"
                      placeholder="Your name"
                    />
                  </div>
                  <div>
                    <label htmlFor="auth-password-signup" className="block text-xs font-medium text-neutral-700 dark:text-neutral-300">
                      Password
                    </label>
                    <input
                      id="auth-password-signup"
                      type="password"
                      autoComplete="new-password"
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      className="mt-1 w-full rounded-lg border border-neutral-300 bg-white px-3 py-2 text-sm text-neutral-900 dark:border-neutral-600 dark:bg-neutral-800 dark:text-neutral-100"
                      placeholder="At least 8 characters"
                      minLength={8}
                      required
                    />
                  </div>
                  <div>
                    <label htmlFor="auth-password-confirm" className="block text-xs font-medium text-neutral-700 dark:text-neutral-300">
                      Confirm password
                    </label>
                    <input
                      id="auth-password-confirm"
                      type="password"
                      autoComplete="new-password"
                      value={passwordConfirm}
                      onChange={(e) => setPasswordConfirm(e.target.value)}
                      className="mt-1 w-full rounded-lg border border-neutral-300 bg-white px-3 py-2 text-sm text-neutral-900 dark:border-neutral-600 dark:bg-neutral-800 dark:text-neutral-100"
                      placeholder="Re-enter password"
                      minLength={8}
                      required
                    />
                  </div>
                </>
              )}
              {error && (
                <p className="text-xs text-red-600 dark:text-red-400">{error}</p>
              )}
              <button
                type="submit"
                disabled={submitting}
                className="w-full rounded-lg bg-sky-600 py-2 text-sm font-medium text-white hover:bg-sky-500 disabled:opacity-50"
              >
                {submitting
                  ? mode === "login"
                    ? "Signing in…"
                    : "Creating account…"
                  : mode === "login"
                  ? "Sign in"
                  : "Sign up"}
              </button>
            </form>
          </div>
        </div>
      )}
    </>
  );
}
