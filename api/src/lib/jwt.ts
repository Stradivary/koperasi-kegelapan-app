/**
 * JWT signing and verification utilities using HMAC-SHA256.
 *
 * Uses Web Crypto API for HMAC operations (compatible with Cloudflare Workers).
 * Replaces the previous unsigned `alg: "none"` tokens.
 */

const ENC = new TextEncoder();

/** Standard base64url encoding (no padding). */
function base64url(data: Uint8Array): string {
  const base64 = btoa(String.fromCodePoint(...data));
  return base64.replaceAll("+", "-").replaceAll("/", "_").replaceAll("=", "");
}

/** Encode a string to base64url. */
function strToBase64url(str: string): string {
  return base64url(ENC.encode(str));
}

/** Decode base64url to string. */
function base64urlToStr(b64: string): string {
  const padded = b64.replaceAll("-", "+").replaceAll("_", "/");
  const pad = (4 - (padded.length % 4)) % 4;
  return atob(padded + "=".repeat(pad));
}

/** Import a string key as a CryptoKey for HMAC-SHA256. */
async function importHmacKey(secret: string): Promise<CryptoKey> {
  return crypto.subtle.importKey(
    "raw",
    ENC.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign", "verify"],
  );
}

/** Compute HMAC-SHA256 signature and return as base64url. */
async function sign(data: string, key: CryptoKey): Promise<string> {
  const sig = await crypto.subtle.sign("HMAC", key, ENC.encode(data));
  return base64url(new Uint8Array(sig));
}

/** Verify HMAC-SHA256 signature (constant-time via Web Crypto). */
async function verify(data: string, signature: string, key: CryptoKey): Promise<boolean> {
  // Instead of verifying the provided signature directly, we compute the
  // expected signature and compare. This avoids ArrayBuffer compatibility
  // issues across different JS environments (jsdom, Workers, Node).
  const expected = await sign(data, key);
  if (expected.length !== signature.length) return false;
  // Constant-time comparison of base64url strings
  let diff = 0;
  for (let i = 0; i < expected.length; i++) {
    diff |= expected.codePointAt(i)! ^ signature.codePointAt(i)!;
  }
  return diff === 0;
}

// ── Public Types ─────────────────────────────────────────────────────────────

export interface JwtPayload {
  accountId: string;
  tenantId: string;
  role: string;
  deviceId?: string;
  iat: number;
  exp: number;
}

export interface SignTokenOptions {
  accountId: string;
  tenantId: string;
  role: string;
  deviceId?: string;
  /** Token lifetime in seconds. Defaults to 1 hour. */
  expiresInSeconds?: number;
}

// ── Public API ───────────────────────────────────────────────────────────────

/** Default access token lifetime: 1 hour. */
const DEFAULT_EXPIRES_IN = 3600;

/**
 * Build and sign a JWT access token using HMAC-SHA256.
 *
 * @param options - Token payload fields
 * @param secret - The SESSION_MASTER_KEY used for signing
 * @returns Signed JWT string (header.payload.signature)
 */
export async function signAccessToken(options: SignTokenOptions, secret: string): Promise<string> {
  const now = Math.floor(Date.now() / 1000);
  const exp = now + (options.expiresInSeconds ?? DEFAULT_EXPIRES_IN);

  const header = strToBase64url(JSON.stringify({ alg: "HS256", typ: "JWT" }));
  const payload: JwtPayload = {
    accountId: options.accountId,
    tenantId: options.tenantId,
    role: options.role,
    ...(options.deviceId && { deviceId: options.deviceId }),
    iat: now,
    exp,
  };
  const body = strToBase64url(JSON.stringify(payload));

  const signingInput = `${header}.${body}`;
  const key = await importHmacKey(secret);
  const signature = await sign(signingInput, key);

  return `${signingInput}.${signature}`;
}

/**
 * Verify and decode a JWT access token.
 *
 * Checks:
 * 1. Token structure (3 parts)
 * 2. HMAC-SHA256 signature validity
 * 3. Token expiration (`exp` claim)
 *
 * During the grace period, unsigned tokens (sig === "unsigned") are accepted
 * with a console warning. Remove this after migration is complete.
 *
 * @param token - The raw JWT string
 * @param secret - The SESSION_MASTER_KEY used for verification
 * @returns Decoded payload or null if invalid/expired
 */
export async function verifyAccessToken(token: string, secret: string): Promise<JwtPayload | null> {
  const parts = token.split(".");
  if (parts.length !== 3) return null;

  const [header, body, signature] = parts;

  // ── Grace period: accept unsigned tokens temporarily ──────────────────────
  // TODO: Remove this block after migration grace period (48h post-deploy)
  if (signature === "unsigned") {
    try {
      const payload = JSON.parse(base64urlToStr(body));
      if (!payload.accountId || !payload.tenantId) return null;
      console.warn("[JWT] DEPRECATED: unsigned token accepted during grace period", {
        accountId: payload.accountId,
        tenantId: payload.tenantId,
      });
      // Treat unsigned tokens as having 24h expiry from iat (or no expiry if no iat)
      const now = Math.floor(Date.now() / 1000);
      if (payload.iat && now - payload.iat > 86400) return null;
      return {
        accountId: payload.accountId,
        tenantId: payload.tenantId,
        role: payload.role ?? "terminal",
        deviceId: payload.deviceId,
        iat: payload.iat ?? now,
        exp: payload.exp ?? (payload.iat ? payload.iat + 86400 : now + 86400),
      };
    } catch {
      return null;
    }
  }
  // ── End grace period block ────────────────────────────────────────────────

  // Verify signature
  const key = await importHmacKey(secret);
  const signingInput = `${header}.${body}`;
  const valid = await verify(signingInput, signature, key);
  if (!valid) return null;

  // Decode and validate payload
  try {
    const payload = JSON.parse(base64urlToStr(body));
    if (!payload.accountId || !payload.tenantId || !payload.exp) return null;

    // Check expiration
    const now = Math.floor(Date.now() / 1000);
    if (payload.exp <= now) return null;

    return {
      accountId: payload.accountId,
      tenantId: payload.tenantId,
      role: payload.role ?? "terminal",
      deviceId: payload.deviceId,
      iat: payload.iat ?? now,
      exp: payload.exp,
    };
  } catch {
    return null;
  }
}

/**
 * Decode a JWT payload WITHOUT verification.
 * Use only for extracting deviceId in pre-auth middleware (e.g., device block check).
 * Never trust the contents for authorization decisions.
 */
export function decodeTokenPayloadUnsafe(token: string): Record<string, unknown> | null {
  try {
    const parts = token.split(".");
    if (parts.length < 2) return null;
    return JSON.parse(base64urlToStr(parts[1]));
  } catch {
    return null;
  }
}
