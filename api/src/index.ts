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

// CORS must be applied before all other middleware to handle OPTIONS preflight
app.use("/api/*", corsMiddleware);

// Apply device block enforcement middleware to all API routes.
// The middleware itself skips requests without a device_id in the token
// (backward compatibility), which covers unauthenticated routes like /api/auth/token.
app.use("/api/*", deviceBlockCheck);

// Apply rate limiting only to sync endpoints (60 req/min per device_id)
app.use("/api/sync/*", syncRateLimit);

// Apply analytics tracking to sync endpoints (Cloudflare Analytics Engine)
app.use("/api/sync/*", syncAnalytics);

app.route("/api/auth", authRoutes);
app.route("/api/session-grant", sessionGrantRoute);
app.route("/api/policy", policyRoute);
app.route("/api/reconcile", reconcileRoute);
app.route("/api/tenants", tenantsRoutes);
app.route("/api/superadmin", superadminRoutes);
app.route("/api/accounts", accountsRoutes);
app.route("/api/sync", syncRoutes);
app.route("/api/cards", cardsRoutes);
app.route("/api/client-errors", clientErrorsRoute);

export default app;
