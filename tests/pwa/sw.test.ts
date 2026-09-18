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
 */

const swSource = readFileSync(join(process.cwd(), "public", "sw.js"), "utf-8");

describe("Service Worker: file structure", () => {
  it("is a valid service worker file at public/sw.js", () => {
    expect(swSource.length).toBeGreaterThan(100);
    expect(swSource).toMatch(/self\.addEventListener\("install"/);
    expect(swSource).toMatch(/self\.addEventListener\("activate"/);
    expect(swSource).toMatch(/self\.addEventListener\("fetch"/);
  });

  it("uses a versioned cache name with smarts-shell prefix", () => {
    expect(swSource).toMatch(/smarts-shell-/);
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

  it("calls skipWaiting on install for faster activation", () => {
    expect(swSource).toMatch(/skipWaiting/);
  });
});

describe("Service Worker: activate behavior", () => {
  it("cleans up old caches on activate", () => {
    // caches.keys() is used to enumerate caches for cleanup (may span lines)
    expect(swSource).toMatch(/keys\(\)/);
    expect(swSource).toMatch(/\.delete\(/);
  });

  it("only deletes smarts-shell caches (not other app caches)", () => {
    expect(swSource).toMatch(/smarts-shell-/);
    expect(swSource).toMatch(/\.filter/);
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

  it("falls back to offline page when navigation fetch fails", () => {
    expect(swSource).toMatch(/OFFLINE_PAGE/);
    expect(swSource).toMatch(/catch.*caches\.match/);
  });

  it("uses cache-first for static versioned assets", () => {
    expect(swSource).toMatch(/isStaticAsset/);
    expect(swSource).toMatch(/_next\/static/);
  });

  it("never caches mutation/API requests", () => {
    // The SW has no API-specific cache logic — everything non-static passes through
    expect(swSource).not.toMatch(/cache.*post/i);
    expect(swSource).not.toMatch(/cache.*mutation/i);
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
});

describe("Service Worker: update safety", () => {
  it("does not force a page reload on update", () => {
    expect(swSource).not.toMatch(/location\.reload/);
    expect(swSource).not.toMatch(/clients\.openWindow/);
  });

  it("does not clear all caches on update", () => {
    // The SW must filter caches to only delete its own prefix
    expect(swSource).toMatch(/\.filter.*smarts-shell/);
  });

  it("cache version is a named constant for safe invalidation", () => {
    expect(swSource).toMatch(/CACHE_VERSION/);
    expect(swSource).toMatch(/CACHE_NAME/);
  });

  it("never clears browser storage on update", () => {
    expect(swSource).not.toMatch(/removeItem/);
    expect(swSource).not.toMatch(/clear\(\)/);
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
