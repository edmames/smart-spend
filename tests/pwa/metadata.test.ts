import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * Phase 2K — Next.js metadata & installability foundation tests
 *
 * Tests the metadata contract declared in src/app/layout.tsx:
 * - manifest is linked
 * - appleWebApp capable is set
 * - icons are declared
 * - applicationName is SmartSpend
 * - theme colors match the design system
 * - SW registration component is wired in
 */

const layoutSource = readFileSync(join(process.cwd(), "src", "app", "layout.tsx"), "utf-8");
const swRegisterSource = readFileSync(join(process.cwd(), "src", "components", "sw-register.tsx"), "utf-8");

describe("Next.js metadata: manifest", () => {
  it("links the web app manifest", () => {
    expect(layoutSource).toContain("manifest.webmanifest");
  });

  it("sets applicationName to SmartSpend", () => {
    expect(layoutSource).toContain('applicationName: "SmartSpend"');
  });

  it("sets description in Bahasa Indonesia", () => {
    expect(layoutSource).toMatch(/Pencatat keuangan harian/);
    expect(layoutSource).toMatch(/IDR/);
  });

  it("declares the title as SmartSpend", () => {
    expect(layoutSource).toContain('default: "SmartSpend"');
  });
});

describe("Next.js metadata: Apple web app / standalone", () => {
  it("declares appleWebApp capable", () => {
    expect(layoutSource).toContain("appleWebApp");
    expect(layoutSource).toContain("capable: true");
  });

  it("declares appleWebApp title as SmartSpend", () => {
    expect(layoutSource).toContain('title: "SmartSpend"');
  });

  it("declares apple touch icon", () => {
    expect(layoutSource).toContain("apple-touch-icon");
    expect(layoutSource).toContain("apple-touch-icon.png");
  });
});

describe("Next.js metadata: icons", () => {
  it("declares favicon.ico", () => {
    expect(layoutSource).toContain("favicon.ico");
  });

  it("declares favicon-32x32.png", () => {
    expect(layoutSource).toContain("favicon-32x32.png");
    expect(layoutSource).toContain("32x32");
  });

  it("declares apple icon with 180x180 size", () => {
    expect(layoutSource).toContain("180x180");
  });
});

describe("Next.js metadata: theme colors", () => {
  it("sets light mode theme color to background", () => {
    expect(layoutSource).toContain("#f5f7f6");
  });

  it("sets dark mode theme color to dark background", () => {
    expect(layoutSource).toContain("#0e151b");
  });

  it("uses viewport-fit cover for safe areas", () => {
    expect(layoutSource).toContain('viewportFit: "cover"');
  });
});

describe("Layout: standalone app shell", () => {
  it("has app-shell and app-content structure", () => {
    expect(layoutSource).toContain('className="app-shell"');
    expect(layoutSource).toContain('className="app-content"');
  });

  it("includes BottomNav for standalone navigation (no browser chrome dependency)", () => {
    expect(layoutSource).toContain("BottomNav");
  });

  it("uses lang=id on html element", () => {
    expect(layoutSource).toContain('<html lang="id">');
  });

  it("registers the service worker component", () => {
    expect(layoutSource).toContain("SWRegister");
  });
});

describe("Service Worker registration component", () => {
  it("guards registration with typeof window check", () => {
    expect(swRegisterSource).toMatch(/typeof window/);
  });

  it("checks for serviceWorker in navigator", () => {
    expect(swRegisterSource).toMatch(/"serviceWorker" in navigator/);
  });

  it("registers from /sw.js", () => {
    expect(swRegisterSource).toContain("/sw.js");
  });

  it("does not force a reload on update", () => {
    expect(swRegisterSource).not.toMatch(/location\.reload/);
    expect(swRegisterSource).not.toMatch(/window\.location\.reload/);
  });

  it("does not clear browser storage on update", () => {
    expect(swRegisterSource).not.toMatch(/localStorage\.clear/);
    expect(swRegisterSource).not.toMatch(/removeItem/);
  });

  it("catches registration errors gracefully", () => {
    expect(swRegisterSource).toMatch(/catch\s*\(\s*error\s*\)/);
  });
});
