import { defineConfig } from "vitest/config";
import path from "path";

export default defineConfig({
  resolve: {
    alias: {
      "#": path.resolve(__dirname, "src"),
      "@": path.resolve(__dirname, "src"),
      "cloudflare:workers": path.resolve(__dirname, "src/__mocks__/cloudflare-workers.ts"),
      "virtual:pwa-register/react": path.resolve(__dirname, "src/__mocks__/pwa-register-react.ts"),
    },
  },
  test: {
    coverage: {
      provider: "v8",
      reporter: ["text", "lcov"],
      include: ["api/src/**/*.ts"],
      exclude: ["api/src/__tests__/**", "api/src/env.d.ts"],
    },
    projects: [
      {
        extends: true,
        test: {
          name: "frontend",
          include: ["src/**/*.test.ts", "src/**/*.test.tsx"],
          environment: "jsdom",
          setupFiles: ["src/test-setup.ts"],
        },
      },
      {
        extends: true,
        test: {
          name: "api",
          include: ["api/src/**/*.test.ts"],
          environment: "node",
        },
      },
    ],
  },
});
