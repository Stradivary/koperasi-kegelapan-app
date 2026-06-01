import { Hono } from "hono";
import { authRoutes } from "./routes/auth";
import { sessionGrantRoute } from "./routes/session-grant";
import { policyRoute } from "./routes/policy";
import { reconcileRoute } from "./routes/reconcile";
import { tenantsRoutes } from "./routes/tenants";
import { superadminRoutes } from "./routes/superadmin";
import { accountsRoutes } from "./routes/accounts";
import { syncRoutes } from "./routes/sync";
import { cardsRoutes } from "./routes/cards";
import { clientErrorsRoute } from "./routes/client-errors";
import { corsMiddleware } from "./middleware/cors";
import { deviceBlockCheck } from "./middleware/deviceBlockCheck";
import { verifyToken } from "./middleware/verifyToken";
import { authRateLimit } from "./middleware/authRateLimit";
import { syncRateLimit } from "./middleware/syncRateLimit";
import { syncAnalytics } from "./middleware/syncAnalytics";

type Env = {
  DB: D1Database;
  SESSION_MASTER_KEY: string;
  SYNC_ANALYTICS?: {
    writeDataPoint(data: { indexes?: string[]; blobs?: string[]; doubles?: number[] }): void;
  };
  CLIENT_ERRORS_ANALYTICS?: {
    writeDataPoint(data: { indexes?: string[]; blobs?: string[]; doubles?: number[] }): void;
  };
};

const app = new Hono<{ Bindings: Env }>();

// ─── Global middleware (all routes) ──────────────────────────────────────────

// CORS must be applied before all other middleware to handle OPTIONS preflight
app.use("/api/*", corsMiddleware);

// Device block enforcement runs on all API routes.
// Uses unsafe token decode (pre-auth) to extract deviceId.
// Skips requests without a device_id in the token (backward compatibility).
app.use("/api/*", deviceBlockCheck);

// ─── Public routes (no token verification required) ──────────────────────────

// Auth endpoints: login and refresh (rate-limited)
app.use("/api/auth/*", authRateLimit);
app.route("/api/auth", authRoutes);

// Public tenant directory — used by login/scout screens before auth.
// Registered before verifyToken so no token is required.
app.route("/api/tenants", tenantsRoutes);

// Session grant endpoint - public for scout role, protected for others
// Must be registered before verifyToken to allow conditional auth
app.route("/api/session-grant", sessionGrantRoute);

// Client error reporting (semi-public, best-effort token extraction)
app.route("/api/client-errors", clientErrorsRoute);

// ─── Protected routes (token verification required) ──────────────────────────

// All routes below this middleware require a valid signed JWT
app.use("/api/*", verifyToken);

// Apply rate limiting only to sync endpoints (60 req/min per device_id)
app.use("/api/sync/*", syncRateLimit);

// Apply analytics tracking to sync endpoints (Cloudflare Analytics Engine)
app.use("/api/sync/*", syncAnalytics);

app.route("/api/session-grant", sessionGrantRoute);
app.route("/api/policy", policyRoute);
app.route("/api/reconcile", reconcileRoute);
app.route("/api/superadmin", superadminRoutes);
app.route("/api/accounts", accountsRoutes);
app.route("/api/sync", syncRoutes);
app.route("/api/cards", cardsRoutes);

export default app;
