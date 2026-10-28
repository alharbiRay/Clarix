import { defineConfig } from "vitest/config";
import path from "node:path";

export default defineConfig({
  esbuild: { jsx: "automatic" },
  resolve: {
    alias: { "@": path.resolve(__dirname, "src") },
  },
  test: {
    environment: "node",
    include: ["src/**/*.test.{ts,tsx}", "scripts/**/*.test.ts", "evals/**/*.test.ts", "supabase/**/*.test.ts"],
    setupFiles: ["src/test/setup.ts"],
    // Tests must never reach real external services (Gemini, Resend,
    // Supabase). setup.ts blanks the credentials so an accidental real call
    // fails loudly instead of hitting production.
    restoreMocks: true,
    testTimeout: 20_000,
    // Each PGlite suite boots Postgres (WASM) and applies every migration in
    // beforeAll; several run in parallel, which can exceed the 10s default.
    hookTimeout: 60_000,
    // Capped: on Windows, many workers opening files at once can crash one
    // (EBUSY / V8 abort). Four keeps a full run well under a minute.
    maxWorkers: 4,
  },
});
