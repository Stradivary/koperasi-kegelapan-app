/**
 * Client-side session grant generation for local-first / offline scenarios.
 *
 * Mirrors the server's deterministic key derivation:
 *   tenantKey = HMAC-SHA256(masterKey, "${tenantId}:${keyVersion}")
 *   sessionKey = HMAC-SHA256(tenantKey, "session-key")
 *
 * Uses the Web Crypto API (SubtleCrypto) so it works in browsers without Node.js.
 *
 * The local master key matches the server's default dev key. In production,
 * the server uses a different key (set via SESSION_MASTER_KEY env), so local
 * grants are only valid for local-only tenants or as a fallback until the
 * device can reach the server to get a "real" grant.
 */

import type { SessionGrant } from "#/core/payload/types";
import { sessionGrantCacheStore, type CachedSessionGrant } from "./indexeddb";
import { roleToOps } from "#/domain/auth/roleOps";

const SESSION_KEY_LIFETIME_SECONDS = 24 * 60 * 60;
const LOCAL_MASTER_KEY = "dev-insecure-master-key-change-in-prod-32b";

const ENC = new TextEncoder();

async function hmacSha256(key: Uint8Array, data: Uint8Array): Promise<Uint8Array> {
  const cryptoKey = await crypto.subtle.importKey(
    "raw",
    key.buffer as ArrayBuffer,
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const sig = await crypto.subtle.sign("HMAC", cryptoKey, data.buffer as ArrayBuffer);
  return new Uint8Array(sig);
}

async function deriveTenantKey(tenantId: string, keyVersion: number): Promise<Uint8Array> {
  const masterKeyBytes = ENC.encode(LOCAL_MASTER_KEY).slice(0, 32);
  return hmacSha256(masterKeyBytes, ENC.encode(`${tenantId}:${keyVersion}`));
}

function bytesToBase64(bytes: Uint8Array): string {
  let bin = "";
  for (let i = 0; i < bytes.length; i++) bin += String.fromCodePoint(bytes[i]);
  return btoa(bin);
}

function base64ToBytes(b64: string): Uint8Array {
  const std = b64.replaceAll("-", "+").replaceAll("_", "/");
  const padded = std + "=".repeat((4 - (std.length % 4)) % 4);
  const bin = atob(padded);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.codePointAt(i)!;
  return bytes;
}

/**
 * Issue a session grant locally using Web Crypto API.
 * This mirrors the server's `issueSessionGrant` logic.
 */
export async function issueLocalSessionGrant(
  tenantId: string,
  accountId: string,
  deviceId: string,
  role: string,
  keyVersion = 1,
): Promise<SessionGrant> {
  const tenantKey = await deriveTenantKey(tenantId, keyVersion);
  const sessionKey = await hmacSha256(tenantKey, ENC.encode("session-key"));
  const expiresAt = Math.floor(Date.now() / 1000) + SESSION_KEY_LIFETIME_SECONDS;
  const allowedOps = roleToOps(role);

  // Compute signature (same as server: HMAC-SHA256 of payload fields)
  const sigPayload = JSON.stringify({ keyVersion, expiresAt, allowedOps, accountId, deviceId });
  const signature = await hmacSha256(tenantKey, ENC.encode(sigPayload));

  return {
    keyVersion,
    sessionKey,
    expiresAt,
    allowedOps,
    signature,
    tenantId,
    accountId,
    deviceId,
  };
}

/**
 * Issue a local session grant and persist it to IndexedDB cache.
 * Call this after a successful local login to ensure the session grant
 * is available immediately when the role page loads.
 */
export async function issueAndCacheLocalSessionGrant(
  tenantId: string,
  accountId: string,
  deviceId: string,
  role: string,
): Promise<SessionGrant> {
  const grant = await issueLocalSessionGrant(tenantId, accountId, deviceId, role);

  // Cache to IndexedDB (best-effort)
  try {
    const cached: CachedSessionGrant = {
      tenantId: grant.tenantId,
      accountId: grant.accountId,
      deviceId: grant.deviceId,
      keyVersion: grant.keyVersion,
      sessionKeyB64: bytesToBase64(grant.sessionKey),
      expiresAt: grant.expiresAt,
      allowedOps: grant.allowedOps,
      signatureB64: bytesToBase64(grant.signature),
      cachedAt: Date.now(),
    };
    await sessionGrantCacheStore.put(cached);
  } catch {
    // Silently fail — caching is best-effort
  }

  return grant;
}

/**
 * Read a locally-issued session grant from cache, or issue a fresh one.
 * Used as a fallback when the API is unreachable and no cached grant exists.
 */
export async function getOrIssueLocalSessionGrant(
  tenantId: string,
  accountId: string,
  deviceId: string,
  role: string,
): Promise<SessionGrant> {
  // Try cache first
  try {
    const cached = await sessionGrantCacheStore.get(tenantId, accountId, deviceId);
    if (cached && cached.expiresAt > Math.floor(Date.now() / 1000)) {
      return {
        tenantId: cached.tenantId,
        accountId: cached.accountId,
        deviceId: cached.deviceId,
        keyVersion: cached.keyVersion,
        sessionKey: base64ToBytes(cached.sessionKeyB64),
        expiresAt: cached.expiresAt,
        allowedOps: cached.allowedOps,
        signature: base64ToBytes(cached.signatureB64),
      };
    }
  } catch {
    // Cache read failed — proceed to issue fresh
  }

  return issueAndCacheLocalSessionGrant(tenantId, accountId, deviceId, role);
}
