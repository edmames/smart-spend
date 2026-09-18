import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

/**
 * Visual Constitution v1 contract tests.
 *
 * These guard the *tokens themselves* (the file is the source of truth), not any
 * rendered markup, so they stay green through legitimate restyling but fail loudly
 * when a theme drifts, a token loses its pair, or text contrast drops below AA.
 *
 * The light `--subtle` value (4.47:1 on `--elevated`) was found by this audit and
 * fixed; these assertions keep it fixed.
 */

const css = readFileSync(path.join(process.cwd(), "src/app/globals.css"), "utf8");

/** Everything between two markers, exclusive of the end marker. */
function section(startMarker: string, endMarker: string): string {
  const start = css.indexOf(startMarker);
  expect(start, `marker not found: ${startMarker}`).toBeGreaterThan(-1);
  const end = css.indexOf(endMarker, start);
  expect(end, `end marker not found: ${endMarker}`).toBeGreaterThan(start);
  return css.slice(start, end);
}

/** `--name: value;` pairs inside a CSS section. */
function declarations(block: string): Record<string, string> {
  const out: Record<string, string> = {};
  for (const match of block.matchAll(/(--[a-z0-9-]+)\s*:\s*([^;]+);/g)) {
    const [, name, value] = match;
    if (name && value) out[name] = value.trim();
  }
  return out;
}

/** Custom properties that describe layout metrics, not themable colour. */
const LAYOUT_ONLY = new Set(["--nav-height"]);

const light = declarations(section(":root {\n  color-scheme: light;", "@media (prefers-color-scheme: dark)"));
const darkMedia = declarations(
  section('@media (prefers-color-scheme: dark) {\n  :root:not([data-theme="light"]) {', ':root[data-theme="dark"]'),
);
const darkAttr = declarations(section(':root[data-theme="dark"] {', "html { -webkit-text-size-adjust"));

function toRgb(value: string): [number, number, number] {
  const hex = value.replace("#", "");
  const full = hex.length === 3 ? hex.split("").map((c) => c + c).join("") : hex;
  if (!/^[0-9a-f]{6}$/i.test(full)) throw new Error(`not a hex colour: ${value}`);
  return [0, 2, 4].map((i) => parseInt(full.slice(i, i + 2), 16) / 255) as [number, number, number];
}

function luminance(value: string): number {
  const [r, g, b] = toRgb(value).map((c) => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4));
  return 0.2126 * r! + 0.7152 * g! + 0.0722 * b!;
}

function contrast(fg: string, bg: string): number {
  const [a, b] = [luminance(fg), luminance(bg)];
  const [hi, lo] = a > b ? [a, b] : [b, a];
  return (hi + 0.05) / (lo + 0.05);
}

const TEXT_ON_SURFACE: [string, string][] = [["--foreground", "--background"], ["--foreground", "--surface"], ["--foreground", "--elevated"], ["--muted", "--background"], ["--muted", "--surface"], ["--muted", "--elevated"], ["--subtle", "--background"], ["--subtle", "--surface"], ["--subtle", "--elevated"]];

const TEXT_ON_FILL: [string, string][] = [
  ["--primary-foreground", "--primary"],
  ["--income-foreground", "--income"],
  ["--expense-foreground", "--expense"],
  ["--warning-foreground", "--warning"],
  ["--transfer-foreground", "--transfer"],
];

describe("design tokens — themes", () => {
  it("defines the same semantic tokens in light and both dark blocks", () => {
    const names = (block: Record<string, string>) =>
      Object.keys(block)
        .filter((name) => !LAYOUT_ONLY.has(name))
        .sort();

    expect(names(darkMedia)).toEqual(names(light));
    expect(names(darkAttr)).toEqual(names(light));
  });

  it("keeps the two dark blocks identical, value for value", () => {
    const mismatches = Object.keys(darkMedia).filter((name) => darkMedia[name] !== darkAttr[name]);
    expect(mismatches).toEqual([]);
  });

  it("resolves every on-colour against a token that exists", () => {
    for (const [foreground] of TEXT_ON_FILL) {
      expect(light[foreground], `${foreground} missing in light`).toBeTruthy();
      expect(darkAttr[foreground], `${foreground} missing in dark`).toBeTruthy();
    }
  });
});

describe("design tokens — text contrast", () => {
  it.each([
    ["light", light],
    ["dark", darkAttr],
  ])("meets AA for every text token on every text surface (%s)", (_theme, tokens) => {
    const failures: string[] = [];
    for (const [fg, bg] of [...TEXT_ON_SURFACE, ...TEXT_ON_FILL]) {
      const fgValue = tokens[fg];
      const bgValue = tokens[bg];
      if (!fgValue || !bgValue) continue;
      const ratio = contrast(fgValue, bgValue);
      if (ratio < 4.5) failures.push(`${fg} on ${bg} = ${ratio.toFixed(2)}:1`);
    }
    expect(failures).toEqual([]);
  });
});
