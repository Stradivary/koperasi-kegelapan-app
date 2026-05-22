import { defineConfig } from "vitest/config";
import path from "path";

export default defineConfig({
  test: {
    environment: "node",
    include: ["src/**/*.test.ts", "src/**/*.test.tsx", "api/src/**/*.test.ts"],
    coverage: {
      provider: "v8",
      reporter: ["text", "lcov"],
      exclude: [
        "src/main.tsx",
        "src/routeTree.gen.ts",
        "src/db/index.ts",
      ],
    },
  },
  resolve: {
    alias: {
      "#": path.resolve(__dirname, "src"),
      "@": path.resolve(__dirname, "src"),
      "cloudflare:workers": path.resolve(__dirname, "src/__mocks__/cloudflare-workers.ts"),
    },
  },
});
