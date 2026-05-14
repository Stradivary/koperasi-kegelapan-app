import { defineConfig } from 'vite'
import { devtools } from '@tanstack/devtools-vite'
import { tanstackStart } from '@tanstack/react-start/plugin/vite'
import viteReact from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { cloudflare } from '@cloudflare/vite-plugin'
import { VitePWA } from 'vite-plugin-pwa'

const config = defineConfig({
  resolve: { tsconfigPaths: true, dedupe: ['react', 'react-dom'] },
  plugins: [
    devtools(),
    cloudflare({ viteEnvironment: { name: 'ssr' } }),
    tailwindcss(),
    tanstackStart(),
    viteReact(),
    VitePWA({
      registerType: 'prompt',
      injectRegister: null,
      includeAssets: [
        'favicon.ico',
        'logo192.png',
        'logo512.png',
        'assets/TelkomselBatikSans-Bold.woff2',
        'assets/TelkomselBatikSans-Regular.woff2',
      ],
      manifest: {
        name: 'Koperasi Kegelapan',
        short_name: 'KK Wallet',
        description: 'Dompet NFC Koperasi — By Telkomsel',
        theme_color: '#FF0025',
        background_color: '#001A41',
        display: 'standalone',
        orientation: 'portrait',
        start_url: '/',
        icons: [
          { src: 'favicon.ico', sizes: '64x64 32x32 24x24 16x16', type: 'image/x-icon' },
          { src: 'logo192.png', type: 'image/png', sizes: '192x192' },
          { src: 'logo512.png', type: 'image/png', sizes: '512x512', purpose: 'any maskable' },
        ],
      },
      workbox: {
        // Cache all static assets (JS/CSS/fonts/images)
        globPatterns: ['**/*.{js,css,html,ico,png,svg,woff,woff2,ttf}'],
        // Runtime caching strategies
        runtimeCaching: [
          {
            // Poppins from Google Fonts
            urlPattern: /^https:\/\/fonts\.googleapis\.com\/.*/i,
            handler: 'StaleWhileRevalidate',
            options: {
              cacheName: 'google-fonts-stylesheets',
              expiration: { maxEntries: 4, maxAgeSeconds: 60 * 60 * 24 * 365 },
            },
          },
          {
            urlPattern: /^https:\/\/fonts\.gstatic\.com\/.*/i,
            handler: 'CacheFirst',
            options: {
              cacheName: 'google-fonts-webfonts',
              expiration: { maxEntries: 8, maxAgeSeconds: 60 * 60 * 24 * 365 },
              cacheableResponse: { statuses: [0, 200] },
            },
          },
          {
            // Policy API — prefer network, fall back to cache
            urlPattern: /\/api\/policy/,
            handler: 'NetworkFirst',
            options: {
              cacheName: 'api-policy',
              networkTimeoutSeconds: 5,
              expiration: { maxEntries: 8, maxAgeSeconds: 60 * 60 * 24 },
            },
          },
          {
            // Session grant — network only (must be fresh)
            urlPattern: /\/api\/session-grant/,
            handler: 'NetworkOnly',
          },
          {
            // Reconcile — network only, queued via IndexedDB outbox
            urlPattern: /\/api\/reconcile/,
            handler: 'NetworkOnly',
          },
        ],
      },
      devOptions: {
        enabled: false,
      },
    }),
  ],
})

export default config
