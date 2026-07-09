import { fileURLToPath } from "node:url";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vitest/config";

// Runs `*.test.ts(x)` files that modules ship alongside their source. `@/…`
// resolves to ./src (same as the tsconfig path). Default env is node (fast, and
// `fetch`/`Response` are native); component tests opt into a DOM with a
// `// @vitest-environment jsdom` docblock at the top of the file.
export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: { "@": fileURLToPath(new URL("./src", import.meta.url)) },
  },
  test: {
    environment: "node",
    clearMocks: true,
    include: ["**/*.test.ts", "**/*.test.tsx"],
    // A web app whose selected modules ship no tests shouldn't fail `pnpm test`.
    passWithNoTests: true,
  },
});
