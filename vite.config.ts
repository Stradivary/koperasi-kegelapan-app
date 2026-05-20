import { defineConfig } from "vite";
import { devtools } from "@tanstack/devtools-vite";
import { TanStackRouterVite } from "@tanstack/router-plugin/vite";
import viteReact from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import { VitePWA } from "vite-plugin-pwa";
import basicSsl from "@vitejs/plugin-basic-ssl";

const config = defineConfig({
  plugins: [
    devtools(),
    basicSsl(),
    tailwindcss(),
    TanStackRouterVite(),
    viteReact(),
    VitePWA({
      registerType: "autoUpdate",
      injectRegister: "auto",
      strategies: "generateSW",

      includeAssets: ["favicon.ico", "logo192.png", "logo256.png", "logo512.png"],

      manifest: {
        id: "/",
        name: "Koperasi Kegelapan (Stradivary)",
        short_name: "KK Wallet",
        description: "Dompet NFC Koperasi — Stradivary",

        start_url: "/",
        display: "standalone",
        display_override: ["standalone", "minimal-ui"],
        orientation: "portrait",

        theme_color: "#FF0025",
        background_color: "#001A41",

        lang: "id",
        dir: "ltr",

        prefer_related_applications: false,

        icons: [
          {
            src: "favicon.ico",
            sizes: "64x64 32x32 24x24 16x16",
            type: "image/x-icon",
          },
          {
            src: "logo192.png",
            type: "image/png",
            sizes: "192x192",
          },
          {
            src: "logo256.png",
            type: "image/png",
            sizes: "256x256",
            purpose: "any maskable",
          },
          {
            src: "logo512.png",
            type: "image/png",
            sizes: "512x512",
            purpose: "any maskable",
          },
        ],

        shortcuts: [
          {
            name: "Scan NFC",
            short_name: "Scan",
            url: "/scan?entry=shortcut",
            icons: [
              {
                src: "logo192.png",
                sizes: "192x192",
                type: "image/png",
              },
            ],
          },
          {
            name: "Top Up",
            short_name: "TopUp",
            url: "/topup?entry=shortcut",
            icons: [
              {
                src: "logo192.png",
                sizes: "192x192",
                type: "image/png",
              },
            ],
          },
        ],

        categories: ["finance", "utilities"],
      },

      workbox: {
        skipWaiting: true,
        clientsClaim: true,

        globPatterns: ["**/*.{js,css,html,ico,png,svg,woff,woff2,ttf,json}"],

        maximumFileSizeToCacheInBytes: 5 * 1024 * 1024,

        navigateFallback: "/index.html",
        navigateFallbackDenylist: [/^\/api\//],

        runtimeCaching: [
          // Critical wallet actions — never cache
          {
            urlPattern: /^https?:\/\/.*\/api\/(transaction|balance|tap)/i,
            handler: "NetworkOnly",
          },
          // Non-critical API — allow fallback
          {
            urlPattern: /^https?:\/\/.*\/api\/.*/i,
            handler: "NetworkFirst",
            options: {
              cacheName: "api-cache",
              expiration: {
                maxEntries: 50,
                maxAgeSeconds: 60 * 60 * 24,
              },
              networkTimeoutSeconds: 5,
            },
          },
        ],
      },

      devOptions: {
        enabled: process.env.PWA_DEV === "1",
      },
    }),
  ],

  resolve: {
    dedupe: ["react", "react-dom"],
  },

  server: {
    host: true,
    proxy: {
      "/api": {
        target: "http://localhost:8787",
        changeOrigin: true,
      },
    },
  },
});

export default config;
