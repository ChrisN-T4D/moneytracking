"use client";

import { HeaderAuth } from "./HeaderAuth";

export function LandingPage() {
  return (
    <main className="min-h-screen pb-safe relative">
      {/* Background GIF */}
      <div className="fixed inset-0 z-0 overflow-hidden">
        <img
          src="/background.gif"
          alt=""
          className="w-full h-full object-cover"
        />
        {/* Overlay for readability */}
        <div className="absolute inset-0 bg-gradient-to-br from-sky-50/80 via-white/60 to-neutral-50/80 dark:from-neutral-900/90 dark:via-neutral-950/90 dark:to-neutral-950/90" />
      </div>
      <header className="sticky top-0 z-20 bg-white/80 dark:bg-neutral-900/80 backdrop-blur supports-[backdrop-filter]:bg-white/60 dark:supports-[backdrop-filter]:bg-neutral-900/60 border-b border-neutral-200 dark:border-neutral-800 px-4 py-3 safe-area-inset-top">
        <div className="flex items-baseline justify-between gap-2 max-w-2xl mx-auto">
          <div>
            <h1 className="text-xl font-semibold text-neutral-900 dark:text-neutral-100">
              Neu Money Tracking
            </h1>
          </div>
          <HeaderAuth />
        </div>
      </header>

      <div className="px-4 py-16 max-w-2xl mx-auto relative z-10">
        <div className="rounded-2xl border border-neutral-200/80 bg-white/80 backdrop-blur-sm shadow-lg dark:border-neutral-800 dark:bg-neutral-900/80 p-6 sm:p-8">
          <p className="text-xs uppercase tracking-[0.2em] text-neutral-500 dark:text-neutral-500 mb-3 text-center">
            It&apos;s money time
          </p>
          <h2 className="text-2xl sm:text-3xl font-semibold text-neutral-900 dark:text-neutral-100 text-center mb-6">
            Take a breath.<br className="hidden sm:inline" />Let&apos;s look at the numbers together.
          </h2>

          <div className="flex flex-col items-center gap-3">
            <HeaderAuth />
          </div>
        </div>
      </div>
    </main>
  );
}
