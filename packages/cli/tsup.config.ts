import { defineConfig } from "tsup";

export default defineConfig({
  entry: ["src/index.ts", "src/create-bin.ts"],
  format: ["esm"],
  target: "node20",
  clean: true,
  sourcemap: true,
  // Ship the CLI as a thin bundle; runtime deps stay external (installed via node_modules).
  banner: { js: "#!/usr/bin/env node" },
});
