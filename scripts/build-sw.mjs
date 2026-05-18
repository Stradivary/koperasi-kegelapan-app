/**
 * Post-build script: compiles the custom service worker (src/sw.ts)
 * and injects the precache manifest from dist/client assets.
 *
 * Run after `vite build` completes.
 * Uses Vite's build API (Rollup) — no esbuild dependency needed.
 */
import { injectManifest } from "workbox-build";
import { build } from "vite";
import { mkdirSync } from "fs";

const SW_SRC = "src/sw.ts";
const SW_DEST = "dist/client/sw.js";
const GLOB_DIR = "dist/client";

async function main() {
  // Step 1: Bundle the SW TypeScript source to JS using Vite
  mkdirSync("dist/client", { recursive: true });
  await build({
    configFile: false,
    logLevel: "warn",
    build: {
      emptyOutDir: false,
      lib: {
        entry: SW_SRC,
        formats: ["es"],
        fileName: () => "sw.js",
      },
      outDir: "dist/client",
      rollupOptions: {
        output: {
          entryFileNames: "sw.js",
        },
      },
      minify: true,
      sourcemap: false,
    },
    define: {
      "self.__WB_MANIFEST": "self.__WB_MANIFEST",
      "process.env.NODE_ENV": JSON.stringify("production"),
    },
  });

  // Step 2: Inject the precache manifest into the bundled SW
  const { count, size, warnings } = await injectManifest({
    swSrc: SW_DEST,
    swDest: SW_DEST,
    globDirectory: GLOB_DIR,
    globPatterns: ["**/*.{js,css,html,ico,png,svg,woff,woff2,ttf}"],
    globIgnores: ["sw.js", "workbox-*.js"],
    maximumFileSizeToCacheInBytes: 5 * 1024 * 1024,
  });

  if (warnings.length > 0) {
    console.warn("⚠️  Workbox warnings:", warnings.join("\n"));
  }

  console.log(`✅ SW built: ${count} files precached (${(size / 1024).toFixed(0)} KB)`);
}

main().catch((err) => {
  console.error("❌ SW build failed:", err);
  process.exit(1);
});
