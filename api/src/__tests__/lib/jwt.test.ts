// @vitest-environment node
/**
 * Tests for api/src/lib/jwt.ts
 * Covers: signAccessToken, verifyAccessToken (valid, expired, bad sig,
 *         grace-period unsigned tokens), decodeTokenPayloadUnsafe
 */
import { describe, expect, it } from "vitest";
import { decodeTokenPayloadUnsafe, signAccessToken, verifyAccessToken } from "../../lib/jwt";

const SECRET = "test-secret-key-32-bytes-long!!!";

// ── Helpers ───────────────────────────────────────────────────────────────────

/** Build a legacy unsigned token (grace-period format). */
function makeUnsignedToken(payload: Record<string, unknown>): string {
  const header = btoa(JSON.stringify({ alg: "HS256", typ: "JWT" }));
  const body = btoa(JSON.stringify(payload));
  return `${header}.${body}.unsigned`;
}

// ── signAccessToken ───────────────────────────────────────────────────────────

describe("signAccessToken", () => {
  it("returns a 3-part JWT string", async () => {
    const token = await signAccessToken(
      { accountId: "a-1", tenantId: "t-1", role: "admin" },
      SECRET,
    );
    expect(token.split(".").length).toBe(3);
  });

  it("encodes accountId, tenantId, role in payload", async () => {
    const token = await signAccessToken(
      { accountId: "a-1", tenantId: "t-1", role: "terminal" },
      SECRET,
    );
    const [, body] = token.split(".");
    const payload = JSON.parse(atob(body.replaceAll("-", "+").replaceAll("_", "/")));
    expect(payload.accountId).toBe("a-1");
    expect(payload.tenantId).toBe("t-1");
    expect(payload.role).toBe("terminal");
  });

  it("includes deviceId when provided", async () => {
    const token = await signAccessToken(
      { accountId: "a-1", tenantId: "t-1", role: "admin", deviceId: "d-1" },
      SECRET,
    );
    const [, body] = token.split(".");
    const payload = JSON.parse(atob(body.replaceAll("-", "+").replaceAll("_", "/")));
    expect(payload.deviceId).toBe("d-1");
  });

  it("omits deviceId when not provided", async () => {
    const token = await signAccessToken(
      { accountId: "a-1", tenantId: "t-1", role: "admin" },
      SECRET,
    );
    const [, body] = token.split(".");
    const payload = JSON.parse(atob(body.replaceAll("-", "+").replaceAll("_", "/")));
    expect(payload.deviceId).toBeUndefined();
  });

  it("sets exp ~1 hour in the future by default", async () => {
    const before = Math.floor(Date.now() / 1000);
    const token = await signAccessToken(
      { accountId: "a-1", tenantId: "t-1", role: "admin" },
      SECRET,
    );
    const [, body] = token.split(".");
    const payload = JSON.parse(atob(body.replaceAll("-", "+").replaceAll("_", "/")));
    expect(payload.exp).toBeGreaterThanOrEqual(before + 3600 - 1);
    expect(payload.exp).toBeLessThanOrEqual(before + 3600 + 2);
  });

  it("respects custom expiresInSeconds", async () => {
    const before = Math.floor(Date.now() / 1000);
    const token = await signAccessToken(
      { accountId: "a-1", tenantId: "t-1", role: "admin", expiresInSeconds: 7200 },
      SECRET,
    );
    const [, body] = token.split(".");
    const payload = JSON.parse(atob(body.replaceAll("-", "+").replaceAll("_", "/")));
    expect(payload.exp).toBeGreaterThanOrEqual(before + 7200 - 1);
  });
});

// ── verifyAccessToken - valid tokens ──────────────────────────────────────────

describe("verifyAccessToken - valid token", () => {
  it("returns payload for a freshly signed token", async () => {
    const token = await signAccessToken(
      { accountId: "a-1", tenantId: "t-1", role: "admin" },
      SECRET,
    );
    const payload = await verifyAccessToken(token, SECRET);
    expect(payload).not.toBeNull();
    expect(payload!.accountId).toBe("a-1");
    expect(payload!.tenantId).toBe("t-1");
    expect(payload!.role).toBe("admin");
  });

  it("returns payload with deviceId when present", async () => {
    const token = await signAccessToken(
      { accountId: "a-1", tenantId: "t-1", role: "gate", deviceId: "d-1" },
      SECRET,
    );
    const payload = await verifyAccessToken(token, SECRET);
    expect(payload!.deviceId).toBe("d-1");
  });

  it("defaults role to terminal when missing", async () => {
    // Manually craft a token without role
    const token = await signAccessToken(
      { accountId: "a-1", tenantId: "t-1", role: "terminal" },
      SECRET,
    );
    const payload = await verifyAccessToken(token, SECRET);
    expect(payload!.role).toBe("terminal");
  });
});

// ── verifyAccessToken - invalid tokens ───────────────────────────────────────

describe("verifyAccessToken - invalid tokens", () => {
  it("returns null for token with wrong number of parts", async () => {
    expect(await verifyAccessToken("only.two", SECRET)).toBeNull();
    expect(await verifyAccessToken("one", SECRET)).toBeNull();
    expect(await verifyAccessToken("a.b.c.d", SECRET)).toBeNull();
  });

  it("returns null when signature is wrong", async () => {
    const token = await signAccessToken(
      { accountId: "a-1", tenantId: "t-1", role: "admin" },
      SECRET,
    );
    const [h, b, _sig] = token.split(".");
    const tampered = `${h}.${b}.invalidsignature`;
    expect(await verifyAccessToken(tampered, SECRET)).toBeNull();
  });

  it("returns null when signed with different secret", async () => {
    const token = await signAccessToken(
      { accountId: "a-1", tenantId: "t-1", role: "admin" },
      "different-secret",
    );
    expect(await verifyAccessToken(token, SECRET)).toBeNull();
  });

  it("returns null for expired token", async () => {
    const token = await signAccessToken(
      { accountId: "a-1", tenantId: "t-1", role: "admin", expiresInSeconds: -1 },
      SECRET,
    );
    expect(await verifyAccessToken(token, SECRET)).toBeNull();
  });

  it("returns null when accountId is missing from payload", async () => {
    // Craft a token with missing accountId by manipulating body

    const body = btoa(JSON.stringify({ tenantId: "t-1", exp: 9999999999 }))
      .replaceAll("+", "-")
      .replaceAll("/", "_")
      .replaceAll("=", "");
    // Sign it properly so signature check passes
    const token = await signAccessToken(
      { accountId: "a-1", tenantId: "t-1", role: "admin" },
      SECRET,
    );
    // Replace body with one missing accountId — signature will fail
    const [h, , sig] = token.split(".");
    expect(await verifyAccessToken(`${h}.${body}.${sig}`, SECRET)).toBeNull();
  });
});

// ── verifyAccessToken - grace period (unsigned tokens) ───────────────────────

describe("verifyAccessToken - grace period unsigned tokens", () => {
  it("accepts unsigned token with valid accountId and tenantId", async () => {
    const now = Math.floor(Date.now() / 1000);
    const token = makeUnsignedToken({
      accountId: "a-1",
      tenantId: "t-1",
      role: "admin",
      iat: now,
      exp: now + 3600,
    });
    const payload = await verifyAccessToken(token, SECRET);
    expect(payload).not.toBeNull();
    expect(payload!.accountId).toBe("a-1");
    expect(payload!.tenantId).toBe("t-1");
  });

  it("returns null for unsigned token missing accountId", async () => {
    const token = makeUnsignedToken({ tenantId: "t-1", role: "admin" });
    expect(await verifyAccessToken(token, SECRET)).toBeNull();
  });

  it("returns null for unsigned token missing tenantId", async () => {
    const token = makeUnsignedToken({ accountId: "a-1", role: "admin" });
    expect(await verifyAccessToken(token, SECRET)).toBeNull();
  });

  it("returns null for unsigned token older than 24h", async () => {
    const oldIat = Math.floor(Date.now() / 1000) - 86401;
    const token = makeUnsignedToken({
      accountId: "a-1",
      tenantId: "t-1",
      role: "admin",
      iat: oldIat,
    });
    expect(await verifyAccessToken(token, SECRET)).toBeNull();
  });

  it("defaults role to terminal for unsigned token without role", async () => {
    const now = Math.floor(Date.now() / 1000);
    const token = makeUnsignedToken({ accountId: "a-1", tenantId: "t-1", iat: now });
    const payload = await verifyAccessToken(token, SECRET);
    expect(payload!.role).toBe("terminal");
  });

  it("accepts unsigned token without iat (no expiry check)", async () => {
    const token = makeUnsignedToken({ accountId: "a-1", tenantId: "t-1", role: "admin" });
    const payload = await verifyAccessToken(token, SECRET);
    expect(payload).not.toBeNull();
  });

  it("returns null for unsigned token with malformed body", async () => {
    const token = `header.!!!notbase64!!!.unsigned`;
    expect(await verifyAccessToken(token, SECRET)).toBeNull();
  });
});

// ── decodeTokenPayloadUnsafe ──────────────────────────────────────────────────

describe("decodeTokenPayloadUnsafe", () => {
  it("returns null for token with fewer than 2 parts", () => {
    expect(decodeTokenPayloadUnsafe("single")).toBeNull();
  });

  it("returns null for malformed base64 payload", () => {
    expect(decodeTokenPayloadUnsafe("header.!!!invalid!!!.sig")).toBeNull();
  });

  it("returns null for non-JSON payload", () => {
    const body = btoa("not-json");
    expect(decodeTokenPayloadUnsafe(`header.${body}.sig`)).toBeNull();
  });

  it("decodes payload without verification", async () => {
    const token = await signAccessToken(
      { accountId: "a-1", tenantId: "t-1", role: "admin" },
      SECRET,
    );
    const payload = decodeTokenPayloadUnsafe(token);
    expect(payload).not.toBeNull();
    expect(payload!["accountId"]).toBe("a-1");
    expect(payload!["tenantId"]).toBe("t-1");
  });

  it("decodes unsigned token payload", () => {
    const token = makeUnsignedToken({ accountId: "a-1", tenantId: "t-1", deviceId: "d-1" });
    const payload = decodeTokenPayloadUnsafe(token);
    expect(payload!["deviceId"]).toBe("d-1");
  });
});
