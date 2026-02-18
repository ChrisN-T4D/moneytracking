/**
 * Central list of section color palettes. Each palette defines the card gradient/border look.
 * Add or remove ids here and update ThemeProvider + card components to stay in sync.
 */

export const PALETTE_IDS = [
  "default",
  "sky",
  "violet",
  "emerald",
  "amber",
  "rose",
  "teal",
  "indigo",
  "fuchsia",
  "orange",
] as const;

export type PaletteId = (typeof PALETTE_IDS)[number];

export const PALETTE_LABELS: Record<PaletteId, string> = {
  default: "Default",
  sky: "Sky",
  violet: "Violet",
  emerald: "Emerald",
  amber: "Amber",
  rose: "Rose",
  teal: "Teal",
  indigo: "Indigo",
  fuchsia: "Fuchsia",
  orange: "Orange",
};

/** Tailwind classes for a card section (border + gradient). Each palette uses distinct, visible colors. */
const CARD_CLASSES: Record<PaletteId, string> = {
  default:
    "rounded-2xl border-2 border-slate-200 dark:border-slate-700 bg-gradient-to-br from-slate-100 via-slate-50 to-white dark:from-slate-900/80 dark:via-neutral-950 dark:to-slate-900/60 p-4 shadow-sm",
  sky: "rounded-2xl border-2 border-sky-300 dark:border-sky-700 bg-gradient-to-br from-sky-100 via-sky-50 to-white dark:from-sky-950/90 dark:via-sky-950/70 dark:to-neutral-950 p-4 shadow-sm",
  violet:
    "rounded-2xl border-2 border-violet-300 dark:border-violet-700 bg-gradient-to-br from-violet-100 via-violet-50 to-white dark:from-violet-950/90 dark:via-violet-950/70 dark:to-neutral-950 p-4 shadow-sm",
  emerald:
    "rounded-2xl border-2 border-emerald-300 dark:border-emerald-700 bg-gradient-to-br from-emerald-100 via-emerald-50 to-white dark:from-emerald-950/90 dark:via-emerald-950/70 dark:to-neutral-950 p-4 shadow-sm",
  amber:
    "rounded-2xl border-2 border-amber-300 dark:border-amber-700 bg-gradient-to-br from-amber-100 via-amber-50 to-white dark:from-amber-950/90 dark:via-amber-950/70 dark:to-neutral-950 p-4 shadow-sm",
  rose: "rounded-2xl border-2 border-rose-300 dark:border-rose-700 bg-gradient-to-br from-rose-100 via-rose-50 to-white dark:from-rose-950/90 dark:via-rose-950/70 dark:to-neutral-950 p-4 shadow-sm",
  teal: "rounded-2xl border-2 border-teal-300 dark:border-teal-700 bg-gradient-to-br from-teal-100 via-teal-50 to-white dark:from-teal-950/90 dark:via-teal-950/70 dark:to-neutral-950 p-4 shadow-sm",
  indigo:
    "rounded-2xl border-2 border-indigo-300 dark:border-indigo-700 bg-gradient-to-br from-indigo-100 via-indigo-50 to-white dark:from-indigo-950/90 dark:via-indigo-950/70 dark:to-neutral-950 p-4 shadow-sm",
  fuchsia:
    "rounded-2xl border-2 border-fuchsia-300 dark:border-fuchsia-700 bg-gradient-to-br from-fuchsia-100 via-fuchsia-50 to-white dark:from-fuchsia-950/90 dark:via-fuchsia-950/70 dark:to-neutral-950 p-4 shadow-sm",
  orange:
    "rounded-2xl border-2 border-orange-300 dark:border-orange-700 bg-gradient-to-br from-orange-100 via-orange-50 to-white dark:from-orange-950/90 dark:via-orange-950/70 dark:to-neutral-950 p-4 shadow-sm",
};

export function getCardClasses(paletteId: string): string {
  const id = PALETTE_IDS.includes(paletteId as PaletteId) ? (paletteId as PaletteId) : "default";
  return CARD_CLASSES[id];
}

/** Minimal classes for a small color swatch (gradient + border only, no padding). */
const SWATCH_CLASSES: Record<PaletteId, string> = {
  default:
    "rounded-lg border-2 border-slate-200 dark:border-slate-700 bg-gradient-to-br from-slate-100 via-slate-50 to-white dark:from-slate-900/80 dark:via-neutral-950 dark:to-slate-900/60",
  sky: "rounded-lg border-2 border-sky-300 dark:border-sky-700 bg-gradient-to-br from-sky-100 via-sky-50 to-white dark:from-sky-950/90 dark:via-sky-950/70 dark:to-neutral-950",
  violet:
    "rounded-lg border-2 border-violet-300 dark:border-violet-700 bg-gradient-to-br from-violet-100 via-violet-50 to-white dark:from-violet-950/90 dark:via-violet-950/70 dark:to-neutral-950",
  emerald:
    "rounded-lg border-2 border-emerald-300 dark:border-emerald-700 bg-gradient-to-br from-emerald-100 via-emerald-50 to-white dark:from-emerald-950/90 dark:via-emerald-950/70 dark:to-neutral-950",
  amber:
    "rounded-lg border-2 border-amber-300 dark:border-amber-700 bg-gradient-to-br from-amber-100 via-amber-50 to-white dark:from-amber-950/90 dark:via-amber-950/70 dark:to-neutral-950",
  rose: "rounded-lg border-2 border-rose-300 dark:border-rose-700 bg-gradient-to-br from-rose-100 via-rose-50 to-white dark:from-rose-950/90 dark:via-rose-950/70 dark:to-neutral-950",
  teal: "rounded-lg border-2 border-teal-300 dark:border-teal-700 bg-gradient-to-br from-teal-100 via-teal-50 to-white dark:from-teal-950/90 dark:via-teal-950/70 dark:to-neutral-950",
  indigo:
    "rounded-lg border-2 border-indigo-300 dark:border-indigo-700 bg-gradient-to-br from-indigo-100 via-indigo-50 to-white dark:from-indigo-950/90 dark:via-indigo-950/70 dark:to-neutral-950",
  fuchsia:
    "rounded-lg border-2 border-fuchsia-300 dark:border-fuchsia-700 bg-gradient-to-br from-fuchsia-100 via-fuchsia-50 to-white dark:from-fuchsia-950/90 dark:via-fuchsia-950/70 dark:to-neutral-950",
  orange:
    "rounded-lg border-2 border-orange-300 dark:border-orange-700 bg-gradient-to-br from-orange-100 via-orange-50 to-white dark:from-orange-950/90 dark:via-orange-950/70 dark:to-neutral-950",
};

export function getSwatchClasses(paletteId: string): string {
  const id = PALETTE_IDS.includes(paletteId as PaletteId) ? (paletteId as PaletteId) : "default";
  return SWATCH_CLASSES[id];
}

/** Label text for section headers (e.g. "Amount needed", "Next paychecks"). */
export function getSectionLabelClasses(paletteId: string): string {
  const id = PALETTE_IDS.includes(paletteId as PaletteId) ? (paletteId as PaletteId) : "default";
  const colorMap: Record<PaletteId, string> = {
    default: "text-slate-600 dark:text-slate-300",
    sky: "text-sky-600 dark:text-sky-300",
    violet: "text-violet-600 dark:text-violet-300",
    emerald: "text-emerald-600 dark:text-emerald-300",
    amber: "text-amber-600 dark:text-amber-300",
    rose: "text-rose-600 dark:text-rose-300",
    teal: "text-teal-600 dark:text-teal-300",
    indigo: "text-indigo-600 dark:text-indigo-300",
    fuchsia: "text-fuchsia-600 dark:text-fuchsia-300",
    orange: "text-orange-600 dark:text-orange-300",
  };
  return `text-xs font-semibold uppercase tracking-[0.18em] mb-3 ${colorMap[id]}`;
}
