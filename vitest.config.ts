import { defineConfig } from "vitest/config";
import path from "path";

export default defineConfig({
  test: {
    environment: "node",
    include: ["src/**/*.test.ts", "src/**/*.test.tsx", "api/src/**/*.test.ts"],
    coverage: {
      exclude: [
        "src/components/ui/collapsible.tsx",
        "src/components/ui/dialog.tsx",
        "src/components/ui/dropdown-menu.tsx",
        "src/components/ui/input.tsx",
        "src/components/ui/label.tsx",
        "src/components/ui/select.tsx",
        "src/components/block/**",
        "src/components/section/**",
        "src/routes/**",
        "src/main.tsx",
        "src/routeTree.gen.ts",
        "src/db/index.ts",
        "src/integrations/**",
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
