import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: ["test/**/*.test.ts"],
    globalSetup: ["test/setup/build-views.ts"],
    testTimeout: 60_000,
    hookTimeout: 120_000,
    pool: "forks",
    // Integration tests share local servers: run files one after another.
    fileParallelism: false,
  },
});
