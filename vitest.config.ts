import { fileURLToPath } from "node:url";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vitest/config";

const src = fileURLToPath(new URL("./src", import.meta.url));

/**
 * Two projects, because only the component tests need a DOM:
 *   - `domain`     : financial engine, application actions, repository (node)
 *   - `components` : React components rendered with Testing Library (jsdom)
 * `npm test` runs both; `npm run test:domain` / `test:components` run one each.
 */
export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      "@": src,
    },
  },
  test: {
    include: ["tests/**/*.test.{ts,tsx}"],
    reporters: ["default"],
    projects: [
      {
        extends: true,
        test: {
          name: "domain",
          environment: "node",
          include: ["tests/**/*.test.ts"],
          exclude: ["**/node_modules/**", "tests/components/**"],
          setupFiles: ["./vitest.setup.ts"],
          globals: true,
        },
      },
      {
        extends: true,
        plugins: [react()],
        test: {
          name: "components",
          environment: "jsdom",
          include: ["tests/components/**/*.test.tsx"],
          setupFiles: ["./vitest.setup.ts"],
          globals: true,
        },
      },
    ],
  },
});
