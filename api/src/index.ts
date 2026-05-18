import { Hono } from "hono";
import { authRoutes } from "./routes/auth";
import { sessionGrantRoute } from "./routes/session-grant";
import { policyRoute } from "./routes/policy";
import { reconcileRoute } from "./routes/reconcile";
import { tenantsRoutes } from "./routes/tenants";
import { superadminRoutes } from "./routes/superadmin";
import { accountsRoutes } from "./routes/accounts";

type Env = {
  DB: D1Database;
  SESSION_MASTER_KEY: string;
};

const app = new Hono<{ Bindings: Env }>();

app.route("/api/auth", authRoutes);
app.route("/api/session-grant", sessionGrantRoute);
app.route("/api/policy", policyRoute);
app.route("/api/reconcile", reconcileRoute);
app.route("/api/tenants", tenantsRoutes);
app.route("/api/superadmin", superadminRoutes);
app.route("/api/accounts", accountsRoutes);

export default app;
