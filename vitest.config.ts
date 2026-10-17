import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

export default defineConfig({
  resolve: { alias: { "@": fileURLToPath(new URL(".", import.meta.url)) } },
  test: {
    environment: "node",
    testTimeout: 60_000,
    include: [
      "agent/**/*.test.ts",
      "lib/execution/**/*.test.ts",
      "tests/run-view.test.ts",
      "tests/test-double.test.ts",
    ],
  },
});
