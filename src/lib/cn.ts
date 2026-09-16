/** Tiny class-name joiner (no dependency needed for Phase 1). */
export function cn(...parts: ReadonlyArray<string | false | null | undefined>): string {
  return parts.filter((part): part is string => typeof part === "string" && part.length > 0).join(" ");
}
