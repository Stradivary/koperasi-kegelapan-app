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
      include: [
        "api/src/**/*.ts",
        "src/core/**/*.ts",
        "src/application/**/*.ts",
        "src/infrastructure/**/*.ts",
        "src/server/**/*.ts",
        "src/presentation/hooks/**/*.{ts,tsx}",
        "src/presentation/components/block/**/*.{ts,tsx}",
        "src/presentation/components/section/**/*.{ts,tsx}",
        "src/presentation/components/layout/**/*.{ts,tsx}",
        "src/presentation/lib/**/*.ts",
        "src/presentation/providers/**/*.{ts,tsx}",
      ],
      exclude: [
        "api/src/__tests__/**",
        "api/src/env.d.ts",
        "src/__tests__/**",
        "src/__mocks__/**",
        "src/server/__tests__/**",
        "src/infrastructure/persistence/dexie/indexeddb.ts",
        "src/infrastructure/persistence/dexie/indexeddb.lazy.ts",
        "src/infrastructure/persistence/dexie/localDb.ts",
        "src/infrastructure/persistence/drizzle/**",
      ],
    },
    projects: [
      {
        extends: true,
        test: {
          name: "frontend",
          include: ["src/**/*.test.ts", "src/**/*.test.tsx"],
          exclude: ["src/server/__tests__/**"],
          environment: "jsdom",
          setupFiles: ["src/test-setup.ts"],
        },
      },
      {
        extends: true,
        test: {
          name: "server",
          include: ["src/server/__tests__/**/*.test.ts"],
          environment: "node",
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
