import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    globals: true,
    include: ["src/**/*.test.ts"],
    globalSetup: ["./src/global-setup.ts"],
    testTimeout: 30_000,
    hookTimeout: 90_000,
    // The suite drives one shared Compose stack; files run one at a time so
    // later tickets' Fault switches do not race each other.
    fileParallelism: false,
  },
});
