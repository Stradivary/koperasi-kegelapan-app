import { Hono } from "hono";
import { authRoutes } from "./routes/auth";
import { sessionGrantRoute } from "./routes/session-grant";
import { policyRoute } from "./routes/policy";
import { reconcileRoute } from "./routes/reconcile";
import { tenantsRoutes } from "./routes/tenants";
import { superadminRoutes } from "./routes/superadmin";
import { accountsRoutes } from "./routes/accounts";
import { syncRoutes } from "./routes/sync";
import { deviceBlockCheck } from "./middleware/deviceBlockCheck";
import { syncRateLimit } from "./middleware/syncRateLimit";

type Env = {
  DB: D1Database;
  SESSION_MASTER_KEY: string;
};

const app = new Hono<{ Bindings: Env }>();

// Apply device block enforcement middleware to all API routes.
// The middleware itself skips requests without a device_id in the token
// (backward compatibility), which covers unauthenticated routes like /api/auth/token.
app.use("/api/*", deviceBlockCheck);

// Apply rate limiting only to sync endpoints (60 req/min per device_id)
app.use("/api/sync/*", syncRateLimit);

app.route("/api/auth", authRoutes);
app.route("/api/session-grant", sessionGrantRoute);
app.route("/api/policy", policyRoute);
app.route("/api/reconcile", reconcileRoute);
app.route("/api/tenants", tenantsRoutes);
app.route("/api/superadmin", superadminRoutes);
app.route("/api/accounts", accountsRoutes);
app.route("/api/sync", syncRoutes);

export default app;
