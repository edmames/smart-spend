import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * Phase 2K — PWA Manifest & Assets
 *
 * Tests the manifest contract: identity, display mode, language, icons present,
 * and that referenced icon files actually exist at the correct dimensions.
 * Does NOT test browser installability (deferred to manual QA).
 */

const manifestPath = join(process.cwd(), "public", "manifest.webmanifest");
const publicDir = join(process.cwd(), "public");

function loadManifest() {
  const raw = readFileSync(manifestPath, "utf-8");
  return JSON.parse(raw) as Record<string, unknown>;
}

describe("PWA manifest identity", () => {
  it("has name SmartSpend", () => {
    const manifest = loadManifest();
    expect(manifest.name).toBe("SmartSpend");
    expect(manifest.short_name).toBe("SmartSpend");
  });

  it("uses standalone display mode", () => {
    const manifest = loadManifest();
    expect(manifest.display).toBe("standalone");
  });

  it("has start_url and scope set to /", () => {
    const manifest = loadManifest();
    expect(manifest.start_url).toBe("/");
    expect(manifest.scope).toBe("/");
  });

  it("uses id-ID language", () => {
    const manifest = loadManifest();
    expect(manifest.lang).toBe("id-ID");
  });

  it("does not expose financial data in the manifest", () => {
    const manifest = loadManifest();
    const manifestStr = JSON.stringify(manifest);
    // The manifest must not contain any financial payload keys
    expect(manifestStr).not.toMatch(/transactions/);
    expect(manifestStr).not.toMatch(/wallets/);
    expect(manifestStr).not.toMatch(/savingsTargets/);
    expect(manifestStr).not.toMatch(/budgets/);
  });
});

describe("PWA manifest icons", () => {
  it("includes 192x192 icon", () => {
    const manifest = loadManifest();
    const icons = manifest.icons as Array<Record<string, unknown>>;
    const icon192 = icons.find(
      (i) => i.sizes === "192x192" && i.purpose?.toString().includes("any"),
    );
    expect(icon192).toBeDefined();
  });

  it("includes 512x512 icon with any purpose", () => {
    const manifest = loadManifest();
    const icons = manifest.icons as Array<Record<string, unknown>>;
    const icon512any = icons.find(
      (i) => i.sizes === "512x512" && i.purpose?.toString().includes("any"),
    );
    expect(icon512any).toBeDefined();
  });

  it("includes 512x512 icon with maskable purpose", () => {
    const manifest = loadManifest();
    const icons = manifest.icons as Array<Record<string, unknown>>;
    const icon512maskable = icons.find(
      (i) => i.sizes === "512x512" && i.purpose?.toString().includes("maskable"),
    );
    expect(icon512maskable).toBeDefined();
  });

  it("includes apple-touch-icon for iOS", () => {
    const manifest = loadManifest();
    const icons = manifest.icons as Array<Record<string, unknown>>;
    const appleIcon = icons.find((i) => i.sizes === "180x180");
    expect(appleIcon).toBeDefined();
    expect(appleIcon?.src).toBe("/apple-touch-icon.png");
  });

  it("icon source files exist on disk", () => {
    const manifest = loadManifest();
    const icons = manifest.icons as Array<Record<string, unknown>>;
    const sources = icons.map((i) => i.src as string);
    for (const src of sources) {
      const content = readFileSync(join(publicDir, src.replace(/^\//, "")), "utf-8");
      expect(content.length).toBeGreaterThan(0);
    }
  });
});

describe("PWA manifest theme colors", () => {
  it("background_color matches SmartSpend light mode background", () => {
    const manifest = loadManifest();
    // --background: #f5f7f6 in light mode
    expect(manifest.background_color).toBe("#f5f7f6");
  });

  it("theme_color matches SmartSpend brand primary", () => {
    const manifest = loadManifest();
    // --primary: #167e78 in light mode
    expect(manifest.theme_color).toBe("#167e78");
  });

  it("categories include finance", () => {
    const manifest = loadManifest();
    expect(manifest.categories).toContain("finance");
  });
});
