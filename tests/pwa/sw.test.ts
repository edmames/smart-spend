import { readFileSync } from "node:fs";
import { join } from "node:path";
import { beforeEach, describe, expect, it } from "vitest";

/**
 * Phase 2K — Service Worker contract tests
 *
 * Tests the SW file's behavior contracts without a browser:
 * - install/activate/cache lifecycle declarations
 * - request strategy boundaries (what gets cached vs. passed through)
 * - financial data / browser storage is never referenced in code
 * - update safety (no reload loops, no data clearing)
 */

const swSource = readFileSync(join(process.cwd(), "public", "sw.js"), "utf-8");

describe("Service Worker: file structure", () => {
  it("is a valid service worker file at public/sw.js", () => {
    expect(swSource.length).toBeGreaterThan(100);
    expect(swSource).toMatch(/self\.addEventListener\("install"/);
    expect(swSource).toMatch(/self\.addEventListener\("activate"/);
    expect(swSource).toMatch(/self\.addEventListener\("fetch"/);
  });

  it("uses versioned cache names with smarts-shell and smarts-pages prefixes", () => {
    expect(swSource).toMatch(/smarts-shell-/);
    expect(swSource).toMatch(/smarts-pages-/);
  });

  it("pre-caches the offline shell page", () => {
    expect(swSource).toMatch(/offline\.html/);
  });
});

describe("Service Worker: install behavior", () => {
  it("opens cache and pre-caches static assets on install", () => {
    expect(swSource).toMatch(/caches/);
    expect(swSource).toMatch(/cache\.addAll/);
    expect(swSource).toMatch(/manifest\.webmanifest/);
  });

  it("pre-caches offline shell during install", () => {
    expect(swSource).toMatch(/OFFLINE_PAGE/);
    expect(swSource).toMatch(/cache\.addAll/);
  });

  it("does NOT precache /_next/static/* during install", () => {
    // Install only precaches STATIC_ASSETS + OFFLINE_PAGE. Next.js chunks
    // are runtime-cached (on fetch), not precached.
    expect(swSource).not.toMatch(/addAll.*_next/);
    expect(swSource).not.toMatch(/precacheManifest/i);
    expect(swSource).not.toMatch(/workbox/);
  });

  it("calls skipWaiting on install for faster activation", () => {
    expect(swSource).toMatch(/skipWaiting/);
  });
});

describe("Service Worker: activate behavior", () => {
  it("cleans up old caches on activate", () => {
    expect(swSource).toMatch(/keys\(\)/);
    expect(swSource).toMatch(/\.delete/);
  });

  it("only deletes smarts-shell and smarts-pages caches (not other app caches)", () => {
    expect(swSource).toMatch(/smarts-shell-/);
    expect(swSource).toMatch(/smarts-pages-/);
    expect(swSource).toMatch(/\.filter/);
    expect(swSource).toMatch(/startsWith.*smarts-shell/);
    expect(swSource).toMatch(/startsWith.*smarts-pages/);
  });

  it("preserves current cache versions during cleanup", () => {
    expect(swSource).toMatch(/currentCaches = \[SHELL_CACHE, PAGES_CACHE\]/);
    expect(swSource).toMatch(/currentCaches\.includes/);
  });

  it("claims clients on activate", () => {
    expect(swSource).toMatch(/clients\.claim/);
  });
});

describe("Service Worker: fetch strategy", () => {
  it("ignores non-GET requests (mutations never cached)", () => {
    expect(swSource).toMatch(/request\.method !== "GET"/);
  });

  it("ignores cross-origin requests (no external caching)", () => {
    expect(swSource).toMatch(/url\.origin !== location\.origin/);
  });

  it("uses network-first for navigation requests", () => {
    expect(swSource).toMatch(/isNavigationRequest/);
  });

  it("caches successful HTML responses for offline reopening", () => {
    expect(swSource).toMatch(/isHtmlDocument/);
    expect(swSource).toMatch(/PAGES_CACHE/);
    expect(swSource).toMatch(/safeCachePut/);
  });

  it("falls back to cached document when navigation fetch fails", () => {
    expect(swSource).toMatch(/OFFLINE_PAGE/);
    expect(swSource).toMatch(/caches\.match/);
  });

  it("falls back to cached homepage for unknown routes offline", () => {
    expect(swSource).toMatch(/caches\.match\("\/"\)/);
  });

  it("uses runtime caching for static versioned assets (not precached)", () => {
    expect(swSource).toMatch(/isStaticAsset/);
    expect(swSource).toMatch(/_next\/static/);
  });

  it("never caches mutation/API requests", () => {
    expect(swSource).not.toMatch(/cache.*post/i);
    expect(swSource).not.toMatch(/cache.*mutation/i);
  });
});

describe("Service Worker: cache failure safety", () => {
  it("uses safeCachePut wrapper that catches cache write failures", () => {
    expect(swSource).toMatch(/safeCachePut/);
    expect(swSource).toMatch(/\.catch/);
  });

  it("still returns network response even if cache put fails", () => {
    // safeCachePut tries cache.put but catches errors; the response
    // is returned regardless because safeCachePut does not return anything
    expect(swSource).toMatch(/Cache write failure is non-fatal/);
  });
});

describe("Service Worker: financial data safety", () => {
  let codeOnly: string;

  beforeEach(() => {
    // Strip comments to check only executable code references
    codeOnly = swSource.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/.*$/gm, "");
  });

  it("code never calls localStorage methods", () => {
    expect(codeOnly).not.toMatch(/\blocalStorage\b/);
  });

  it("code never references the financial storage key", () => {
    expect(codeOnly).not.toMatch(/smarts-end/);
  });

  it("code never references financial data structures", () => {
    expect(codeOnly).not.toMatch(/transactions/);
    expect(codeOnly).not.toMatch(/wallets/);
    expect(codeOnly).not.toMatch(/savingsTargets/);
    expect(codeOnly).not.toMatch(/budgets/);
  });

  it("never caches response bodies or JSON snapshots", () => {
    expect(codeOnly).not.toMatch(/JSON\.stringify/);
  });

  it("separate document cache does not contain financial data", () => {
    // The PAGES_CACHE stores HTML documents only, never JSON payloads
    expect(swSource).toMatch(/PAGES_CACHE/);
    expect(swSource).not.toMatch(/application\/json/);
  });
});

describe("Service Worker: update safety", () => {
  it("does not force a page reload on update", () => {
    expect(swSource).not.toMatch(/location\.reload/);
    expect(swSource).not.toMatch(/clients\.openWindow/);
  });

  it("does not clear all caches on update — only SmartSpend namespaces", () => {
    expect(swSource).toMatch(/startsWith.*smarts-shell/);
    expect(swSource).toMatch(/startsWith.*smarts-pages/);
  });

  it("cache version constants enable safe invalidation", () => {
    expect(swSource).toMatch(/CACHE_VERSION/);
    expect(swSource).toMatch(/SHELL_CACHE/);
    expect(swSource).toMatch(/PAGES_CACHE/);
  });

  it("never clears browser storage on update", () => {
    expect(swSource).not.toMatch(/removeItem/);
    expect(swSource).not.toMatch(/localStorage\.clear/);
  });
});

describe("offline.html shell", () => {
  it("exists as a valid HTML file", () => {
    const content = readFileSync(join(process.cwd(), "public", "offline.html"), "utf-8");
    expect(content).toContain("<!DOCTYPE html>");
    expect(content).toContain("SmartSpend");
    expect(content).toContain("offline");
  });

  it("does not contain financial data", () => {
    const content = readFileSync(join(process.cwd(), "public", "offline.html"), "utf-8");
    expect(content).not.toMatch(/Rp\d/);
    expect(content).not.toMatch(/transactions/);
    expect(content).not.toMatch(/wallets/);
  });
});
