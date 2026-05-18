import { Hono } from "hono";

type Env = { DB: D1Database; SESSION_MASTER_KEY: string };

export interface PolicyData {
  tenantId: string;
  maxTransactionAmount: number;
  maxDailyTotal: number;
  topupOnlineOnly: boolean;
  allowedTxTypes: string[];
  sessionTimeoutHours: number;
}

const DEFAULT_POLICY: Omit<PolicyData, "tenantId"> = {
  maxTransactionAmount: 1_000_000,
  maxDailyTotal: 5_000_000,
  topupOnlineOnly: true,
  allowedTxTypes: ["debit", "credit", "checkin", "checkout"],
  sessionTimeoutHours: 24,
};

function getDefaultPolicy(tenantId: string): PolicyData {
  return { ...DEFAULT_POLICY, tenantId };
}

export const policyRoute = new Hono<{ Bindings: Env }>();

policyRoute.get("/", (c) => {
  const tenantId = c.req.query("tenantId");
  if (!tenantId) {
    return c.json({ error: "tenantId required" }, 400);
  }
  return c.json(getDefaultPolicy(tenantId));
});
