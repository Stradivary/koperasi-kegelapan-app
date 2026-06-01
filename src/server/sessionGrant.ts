import { createHmac } from "node:crypto";
import { roleToOps } from "#/lib/roleOps";

const SESSION_KEY_LIFETIME_SECONDS = 24 * 60 * 60;

export interface GrantPayload {
  keyVersion: number;
  sessionKey: string;
  expiresAt: number;
  allowedOps: string[];
  tenantId: string;
  accountId: string;
  deviceId: string;
}

function nowSeconds(): number {
  return Math.floor(Date.now() / 1000);
}

function deriveTenantKey(masterKey: Buffer, tenantId: string, keyVersion: number): Buffer {
  return createHmac("sha256", masterKey).update(`${tenantId}:${keyVersion}`).digest();
}

export function issueSessionGrant(
  masterKey: Buffer,
  tenantId: string,
  accountId: string,
  deviceId: string,
  role: string,
  keyVersion = 1,
): GrantPayload & { signature: string } {
  // Session key is deterministic - derived from tenant key so all devices
  // in the same tenant can read/write cards encrypted with this key.
  const tenantKey = deriveTenantKey(masterKey, tenantId, keyVersion);
  const sessionKey = createHmac("sha256", tenantKey).update("session-key").digest();
  const expiresAt = nowSeconds() + SESSION_KEY_LIFETIME_SECONDS;

  const allowedOps = roleToOps(role);

  const payload: GrantPayload = {
    keyVersion,
    sessionKey: sessionKey.toString("base64"),
    expiresAt,
    allowedOps,
    tenantId,
    accountId,
    deviceId,
  };

  const signature = createHmac("sha256", tenantKey)
    .update(JSON.stringify({ keyVersion, expiresAt, allowedOps, accountId, deviceId }))
    .digest("base64url");

  return { ...payload, signature };
}
