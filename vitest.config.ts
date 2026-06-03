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
      include: ["api/src/**/*.ts", "src/**/*.{ts,tsx}"],
      exclude: [
        "api/src/__tests__/**",
        "api/src/env.d.ts",
        "src/__tests__/**",
        "src/__mocks__/**",
        "src/test-setup.ts",
        "src/routeTree.gen.ts",
        "src/main.tsx",
        "src/styles.css",
        "src/cloudflare-env.d.ts",
        "src/assets/**",
        "src/db/**",
        "src/presentation/routes/**",
        "src/presentation/components/ui/**",
      ],
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
