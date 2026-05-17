/// <reference lib="webworker" />
import { precacheAndRoute, cleanupOutdatedCaches } from "workbox-precaching";
import { registerRoute, NavigationRoute } from "workbox-routing";
import { NetworkFirst, CacheFirst, StaleWhileRevalidate, NetworkOnly } from "workbox-strategies";
import { ExpirationPlugin } from "workbox-expiration";
import { CacheableResponsePlugin } from "workbox-cacheable-response";

declare let self: ServiceWorkerGlobalScope;

// Precache all static assets injected by VitePWA at build time
precacheAndRoute(self.__WB_MANIFEST);
cleanupOutdatedCaches();

// ─── Tenant core pages (gate, scout, station, terminal, kiosk) ───────────────
// Cache navigation responses so these pages work fully offline after first visit
registerRoute(
  ({ url }) => /\/tenant\/[^/]+\/(gate|scout|station|terminal|kiosk)/.test(url.pathname),
  new NetworkFirst({
    cacheName: "tenant-pages",
    networkTimeoutSeconds: 3,
    plugins: [
      new ExpirationPlugin({ maxEntries: 20, maxAgeSeconds: 60 * 60 * 24 * 7 }),
      new CacheableResponsePlugin({ statuses: [0, 200] }),
    ],
  }),
);

// Tenant root page (mode selection)
registerRoute(
  ({ url }) => /\/tenant\/[^/]+$/.test(url.pathname),
  new NetworkFirst({
    cacheName: "tenant-pages",
    networkTimeoutSeconds: 3,
    plugins: [
      new ExpirationPlugin({ maxEntries: 10, maxAgeSeconds: 60 * 60 * 24 * 7 }),
      new CacheableResponsePlugin({ statuses: [0, 200] }),
    ],
  }),
);

// ─── Navigation fallback for all other pages ─────────────────────────────────
// Serve the app shell (index.html) for navigation requests when offline
const navigationHandler = new NetworkFirst({
  cacheName: "navigation-cache",
  networkTimeoutSeconds: 3,
  plugins: [new CacheableResponsePlugin({ statuses: [0, 200] })],
});
registerRoute(new NavigationRoute(navigationHandler, { denylist: [/^\/api\//] }));

// ─── Google Fonts ────────────────────────────────────────────────────────────
registerRoute(
  ({ url }) => url.origin === "https://fonts.googleapis.com",
  new StaleWhileRevalidate({
    cacheName: "google-fonts-stylesheets",
    plugins: [new ExpirationPlugin({ maxEntries: 4, maxAgeSeconds: 60 * 60 * 24 * 365 })],
  }),
);

registerRoute(
  ({ url }) => url.origin === "https://fonts.gstatic.com",
  new CacheFirst({
    cacheName: "google-fonts-webfonts",
    plugins: [
      new ExpirationPlugin({ maxEntries: 8, maxAgeSeconds: 60 * 60 * 24 * 365 }),
      new CacheableResponsePlugin({ statuses: [0, 200] }),
    ],
  }),
);

// ─── API routes ──────────────────────────────────────────────────────────────
// Session grant — network first with cache fallback for offline
registerRoute(
  ({ url }) => url.pathname.startsWith("/api/session-grant"),
  new NetworkFirst({
    cacheName: "api-session-grant",
    networkTimeoutSeconds: 5,
    plugins: [
      new ExpirationPlugin({ maxEntries: 10, maxAgeSeconds: 60 * 60 * 2 }),
      new CacheableResponsePlugin({ statuses: [0, 200] }),
    ],
  }),
);

// Policy API — prefer network, fall back to cache
registerRoute(
  ({ url }) => url.pathname.startsWith("/api/policy"),
  new NetworkFirst({
    cacheName: "api-policy",
    networkTimeoutSeconds: 5,
    plugins: [
      new ExpirationPlugin({ maxEntries: 8, maxAgeSeconds: 60 * 60 * 24 }),
      new CacheableResponsePlugin({ statuses: [0, 200] }),
    ],
  }),
);

// Reconcile — network only, queued via IndexedDB outbox on client
registerRoute(({ url }) => url.pathname.startsWith("/api/reconcile"), new NetworkOnly());

// ─── Listen for skip waiting message ────────────────────────────────────────
self.addEventListener("message", (event) => {
  if (event.data && event.data.type === "SKIP_WAITING") {
    self.skipWaiting();
  }
});
