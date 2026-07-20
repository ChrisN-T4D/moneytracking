/**
 * Resolve whether a bill is essential (must-pay) vs optional (fair game for Cut list).
 * Explicit `isEssential` wins; otherwise bills/SF default essential, subscriptions optional.
 */
export function resolveIsEssential(
  isEssential: boolean | null | undefined,
  listType?: string | null
): boolean {
  if (typeof isEssential === "boolean") return isEssential;
  return (listType ?? "").toLowerCase() !== "subscriptions";
}
