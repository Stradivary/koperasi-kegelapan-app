import { defineConfig } from "vitest/config";
import path from "path";

export default defineConfig({
  test: {
    environment: "jsdom",
    include: ["src/**/*.test.ts", "src/**/*.test.tsx", "api/src/**/*.test.ts"],
    setupFiles: ["src/test-setup.ts"],
    coverage: {
      provider: "v8",
      reporter: ["text", "lcov"],
      exclude: [
        "src/routes/**",
        "src/main.tsx",
        "src/routeTree.gen.ts",
        "src/components/ui/**",
        "src/test-setup.ts",
        "src/db/**",
        "src/lib/indexeddb.ts",
        "**/__tests__/**",
        "src/integrations/**",
      ],
    },
  },
  resolve: {
    alias: {
      "#": path.resolve(__dirname, "src"),
      "@": path.resolve(__dirname, "src"),
      "cloudflare:workers": path.resolve(__dirname, "src/__mocks__/cloudflare-workers.ts"),
      "virtual:pwa-register/react": path.resolve(__dirname, "src/__mocks__/pwa-register-react.ts"),
    },
  },
});
