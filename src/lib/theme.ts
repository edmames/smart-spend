import type { Theme } from "@/domain/models";

/**
 * SmartSpend — theme application.
 *
 * Writes the theme preference onto `<html data-theme>` so the CSS variables
 * in `globals.css` resolve to the right palette. "system" removes the attribute
 * so the `@media (prefers-color-scheme)` rules take over.
 *
 * This is the *only* place that touches the DOM for theming — components
 * read the value from the store, never from the DOM.
 */
const THEME_ATTRIBUTE = "data-theme";

export function applyTheme(theme: Theme): void {
  if (typeof document === "undefined") return;
  const root = document.documentElement;
  if (theme === "system") {
    root.removeAttribute(THEME_ATTRIBUTE);
  } else {
    root.setAttribute(THEME_ATTRIBUTE, theme);
  }
}

/** Read back the effective theme (used by SSR-safety checks). */
export function currentTheme(): Exclude<Theme, "system"> | null {
  if (typeof document === "undefined") return null;
  const value = document.documentElement.getAttribute(THEME_ATTRIBUTE);
  return value === "dark" || value === "light" ? value : null;
}
