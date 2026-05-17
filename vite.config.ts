import { defineConfig } from "vite";
import { devtools } from "@tanstack/devtools-vite";
import { tanstackStart } from "@tanstack/react-start/plugin/vite";
import viteReact from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import { cloudflare } from "@cloudflare/vite-plugin";
import { VitePWA } from "vite-plugin-pwa";
import basicSsl from "@vitejs/plugin-basic-ssl";

const config = defineConfig({
  resolve: { tsconfigPaths: true, dedupe: ["react", "react-dom"] },
  build: {
    rollupOptions: {
      external: [/^cloudflare:/],
    },
  },
  plugins: [
    devtools(),
    basicSsl(),
    cloudflare({
      viteEnvironment: { name: "ssr" },
      remoteBindings:
        process.env.CF_REMOTE_BINDINGS === "1" || process.env.CF_REMOTE_BINDINGS === "true",
    }),
    tailwindcss(),
    tanstackStart(),
    viteReact(),
    VitePWA({
      registerType: "prompt",
      injectRegister: null,
      includeAssets: [
        "favicon.ico",
        "logo192.png",
        "logo512.png",
        "assets/TelkomselBatikSans-Bold.woff2",
        "assets/TelkomselBatikSans-Regular.woff2",
      ],
      manifest: {
        name: "Koperasi Kegelapan",
        short_name: "KK Wallet",
        description: "Dompet NFC Koperasi — By Telkomsel",
        theme_color: "#FF0025",
        background_color: "#001A41",
        display: "fullscreen",
        orientation: "portrait",
        start_url: "/",
        icons: [
          { src: "favicon.ico", sizes: "64x64 32x32 24x24 16x16", type: "image/x-icon" },
          { src: "logo192.png", type: "image/png", sizes: "192x192" },
          { src: "logo512.png", type: "image/png", sizes: "512x512", purpose: "any maskable" },
        ],
      },
      devOptions: {
        enabled: false,
      },
    }),
  ],
  server: {
    host: true, // This enables LAN access
  },
});

export default config;
