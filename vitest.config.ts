import { defineConfig } from "vitest/config";
import { fileURLToPath } from "node:url";

export default defineConfig({
  test: {
    environment: "node",
    include: ["test/**/*.test.ts"],
    setupFiles: ["test/setup.ts"],
    fileParallelism: false,
  },
  resolve: { alias: { "@": fileURLToPath(new URL(".", import.meta.url)) } },
});
