"use client";

import { useEffect } from "react";

/**
 * SmartSpend — Service Worker registration.
 *
 * Registers the PWA service worker from /sw.js. Runs only in production builds
 * (development does not register an SW, so dev never caches stale app assets).
 * Also guarded by `typeof window` and `"serviceWorker" in navigator` for SSR safety.
 *
 * The service worker handles offline shell caching for static assets and
 * navigation fallback; it does NOT read or write the browser's local storage —
 * financial data remains solely managed by the repository boundary in the
 * page context (src/repository/).
 *
 * On update, the new worker activates in the background; we avoid forced
 * reload loops and never clear localStorage.
 */
const SW_URL = "/sw.js";

export function SWRegister() {
  useEffect(() => {
    // Do not register the service worker during development — it would
    // cache and serve stale application assets and mask HMR issues.
    if (process.env.NODE_ENV !== "production") return;
    if (typeof window === "undefined" || !("serviceWorker" in navigator)) return;

    let cancelled = false;

    void (async () => {
      try {
        const registration = await navigator.serviceWorker.register(SW_URL);
        if (cancelled) return;

        // Listen for updates — log but do NOT auto-reload or clear data.
        registration.addEventListener("updatefound", () => {
          const installing = registration.installing;
          if (!installing) return;
          installing.addEventListener("statechange", () => {
            // A new worker is installing; it will activate via the SW lifecycle.
            // We intentionally do NOT force a reload here to avoid disrupting
            // in-progress user input. The user can manually reload at their convenience.
          });
        });
      } catch (error) {
        // Registration failure is non-fatal — the app works without a SW.
        if (cancelled) return;
        // eslint-disable-next-line no-console
        console.warn("SmartSpend SW registration failed:", error);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, []);

  return null;
}
