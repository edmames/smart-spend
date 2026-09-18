/**
 * Categorical data palette (`ChartColorId` → concrete Tailwind classes).
 *
 * Governance: these are *data* colours — they identify a category, they do not
 * express UI meaning. Never use them for chrome (surfaces, text, borders,
 * buttons); use the semantic tokens in `globals.css` instead.
 *
 * Colour identifiers used by category metadata (`ChartColorId`) are resolved to
 * concrete Tailwind classes *here* — the domain only stores the identifier, so a
 * palette change never touches stored data. Values are theme-independent because
 * the same identifier must look like the same category in light and dark.
 *
 * NOTE: every class name is written out literally so Tailwind's scanner can see it.
 */

import type { ChartColorId } from "@/domain/categories";

export interface ColorToken {
  /** Solid background (bars, chips). */
  bar: string;
  /** Soft tinted surface. */
  soft: string;
  /** Foreground text colour on tinted surface. */
  text: string;
  /** Ring/border for tinted surface. */
  border: string;
  /** Hex, for inline SVG fills (charts). */
  hex: string;
}

export const CHART_COLORS: Record<ChartColorId, ColorToken> = {
  rose: { bar: "bg-rose-500", soft: "bg-rose-50", text: "text-rose-700", border: "border-rose-200", hex: "#f43f5e" },
  orange: { bar: "bg-orange-500", soft: "bg-orange-50", text: "text-orange-700", border: "border-orange-200", hex: "#f97316" },
  amber: { bar: "bg-amber-500", soft: "bg-amber-50", text: "text-amber-700", border: "border-amber-200", hex: "#f59e0b" },
  emerald: { bar: "bg-emerald-500", soft: "bg-emerald-50", text: "text-emerald-700", border: "border-emerald-200", hex: "#10b981" },
  teal: { bar: "bg-teal-500", soft: "bg-teal-50", text: "text-teal-700", border: "border-teal-200", hex: "#14b8a6" },
  sky: { bar: "bg-sky-500", soft: "bg-sky-50", text: "text-sky-700", border: "border-sky-200", hex: "#0ea5e9" },
  indigo: { bar: "bg-indigo-500", soft: "bg-indigo-50", text: "text-indigo-700", border: "border-indigo-200", hex: "#6366f1" },
  violet: { bar: "bg-violet-500", soft: "bg-violet-50", text: "text-violet-700", border: "border-violet-200", hex: "#8b5cf6" },
  fuchsia: { bar: "bg-fuchsia-500", soft: "bg-fuchsia-50", text: "text-fuchsia-700", border: "border-fuchsia-200", hex: "#d946ef" },
  slate: { bar: "bg-slate-500", soft: "bg-slate-100", text: "text-slate-700", border: "border-slate-200", hex: "#64748b" },
  lime: { bar: "bg-lime-500", soft: "bg-lime-50", text: "text-lime-700", border: "border-lime-200", hex: "#84cc16" },
  cyan: { bar: "bg-cyan-500", soft: "bg-cyan-50", text: "text-cyan-700", border: "border-cyan-200", hex: "#06b6d4" },
  blue: { bar: "bg-blue-500", soft: "bg-blue-50", text: "text-blue-700", border: "border-blue-200", hex: "#3b82f6" },
  yellow: { bar: "bg-yellow-500", soft: "bg-yellow-50", text: "text-yellow-700", border: "border-yellow-200", hex: "#eab308" },
};

export const FALLBACK_COLOR: ChartColorId = "slate";

export function colorFor(id: ChartColorId | undefined | null): ColorToken {
  return (id && CHART_COLORS[id]) || CHART_COLORS[FALLBACK_COLOR];
}
