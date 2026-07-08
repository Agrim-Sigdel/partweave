import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

// Runs `*.test.ts(x)` files that modules ship alongside their source. `@/…`
// resolves to ./src (same as the tsconfig path). Default env is node (fast, and
// `fetch`/`Response` are native); component tests can opt into jsdom with a
// `// @vitest-environment jsdom` docblock at the top of the file.
export default defineConfig({
  resolve: {
    alias: { "@": fileURLToPath(new URL("./src", import.meta.url)) },
  },
  test: {
    environment: "node",
    clearMocks: true,
    include: ["**/*.test.ts", "**/*.test.tsx"],
  },
});
