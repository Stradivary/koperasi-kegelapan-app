// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from "vitest";

// ── Mocks ─────────────────────────────────────────────────────────────────────

const mockValidateCard = vi.fn();
const mockDecodePayload = vi.fn();
const mockIsTenantBindValid = vi.fn();
const mockDecryptRawCard = vi.fn();

vi.mock("#/core/nfc/pipelineEngine", () => ({
  validateCard: (...args: unknown[]) => mockValidateCard(...args),
  TENANT_MISMATCH_REASON: "tenant_mismatch",
  UNREGISTERED_CARD_MESSAGE: "Kartu tidak terdaftar",
}));

vi.mock("#/core/payload/engine", () => ({
  decodePayload: (...args: unknown[]) => mockDecodePayload(...args),
}));

vi.mock("#/core/payload/tenantBind", () => ({
  isTenantBindValid: (...args: unknown[]) => mockIsTenantBindValid(...args),
}));

vi.mock("../cardDecryption", () => ({
  decryptRawCard: (...args: unknown[]) => mockDecryptRawCard(...args),
}));

function makePayload() {
  return {
    header: { tenantBind: new Uint8Array(4) },
    identity: { name: "Test User" },
    wallet: { balance: 50000 },
  };
}

function makeGrant() {
  return {
    keyVersion: 1,
    sessionKey: new Uint8Array(32),
    expiresAt: Math.floor(Date.now() / 1000) + 3600,
    allowedOps: ["read"],
    signature: new Uint8Array(32),
    tenantId: "t-1",
    accountId: "a-1",
    deviceId: "d-1",
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  mockDecryptRawCard.mockImplementation((raw: Uint8Array) => Promise.resolve(raw));
  mockDecodePayload.mockReturnValue(makePayload());
  mockIsTenantBindValid.mockReturnValue(true);
  mockValidateCard.mockResolvedValue({ valid: true });

  // Default: online
  Object.defineProperty(navigator, "onLine", { value: true, writable: true });
});

describe("decodeAndValidateCard", () => {
  describe("online path", () => {
    it("returns ready phase when validation succeeds", async () => {
      const { decodeAndValidateCard } = await import("../cardValidation");
      const raw = new Uint8Array(80);
      const grant = makeGrant();
      const signal = new AbortController().signal;

      const result = await decodeAndValidateCard(raw, grant as never, "AA:BB", false, signal);
      expect(result.phase).toBe("ready");
      expect(result.payload).toBeTruthy();
      expect(result.error).toBeNull();
    });

    it("returns error phase when validation fails", async () => {
      mockValidateCard.mockResolvedValue({ valid: false, reason: "Kartu tidak valid" });

      const { decodeAndValidateCard } = await import("../cardValidation");
      const raw = new Uint8Array(80);
      const grant = makeGrant();
      const signal = new AbortController().signal;

      const result = await decodeAndValidateCard(raw, grant as never, "AA:BB", false, signal);
      expect(result.phase).toBe("error");
      expect(result.error).toBe("Kartu tidak valid");
    });

    it("sets tamperDetected when validation returns tamper=true", async () => {
      mockValidateCard.mockResolvedValue({
        valid: false,
        reason: "Tamper detected",
        tamper: true,
      });

      const { decodeAndValidateCard } = await import("../cardValidation");
      const raw = new Uint8Array(80);
      const grant = makeGrant();
      const signal = new AbortController().signal;

      const result = await decodeAndValidateCard(raw, grant as never, "AA:BB", false, signal);
      expect(result.tamperDetected).toBe(true);
    });

    it("returns ready with warning in lenient mode when validation fails (non-tamper)", async () => {
      mockValidateCard.mockResolvedValue({
        valid: false,
        reason: "Kartu tidak terdaftar",
        tamper: false,
      });

      const { decodeAndValidateCard } = await import("../cardValidation");
      const raw = new Uint8Array(80);
      const grant = makeGrant();
      const signal = new AbortController().signal;

      const result = await decodeAndValidateCard(raw, grant as never, "AA:BB", true, signal);
      expect(result.phase).toBe("ready");
      expect(result.warning).toBeTruthy();
    });

    it("returns error phase even in lenient mode when tamper is detected", async () => {
      mockValidateCard.mockResolvedValue({
        valid: false,
        reason: "Tamper",
        tamper: true,
      });

      const { decodeAndValidateCard } = await import("../cardValidation");
      const raw = new Uint8Array(80);
      const grant = makeGrant();
      const signal = new AbortController().signal;

      const result = await decodeAndValidateCard(raw, grant as never, "AA:BB", true, signal);
      expect(result.phase).toBe("error");
      expect(result.tamperDetected).toBe(true);
    });

    it("returns error with null payload when signal is aborted", async () => {
      const controller = new AbortController();
      controller.abort();

      // Make validateCard resolve after abort
      mockValidateCard.mockResolvedValue({ valid: true });

      const { decodeAndValidateCard } = await import("../cardValidation");
      const raw = new Uint8Array(80);
      const grant = makeGrant();

      const result = await decodeAndValidateCard(
        raw,
        grant as never,
        "AA:BB",
        false,
        controller.signal,
      );
      expect(result.phase).toBe("error");
      expect(result.payload).toBeNull();
    });
  });

  describe("offline path", () => {
    beforeEach(() => {
      Object.defineProperty(navigator, "onLine", { value: false, writable: true });
    });

    it("returns ready when tenant bind is valid offline", async () => {
      mockIsTenantBindValid.mockReturnValue(true);

      const { decodeAndValidateCard } = await import("../cardValidation");
      const raw = new Uint8Array(80);
      const grant = makeGrant();
      const signal = new AbortController().signal;

      const result = await decodeAndValidateCard(raw, grant as never, "AA:BB", false, signal);
      expect(result.phase).toBe("ready");
      expect(mockValidateCard).not.toHaveBeenCalled();
    });

    it("returns error when tenant bind is invalid offline (non-lenient)", async () => {
      mockIsTenantBindValid.mockReturnValue(false);

      const { decodeAndValidateCard } = await import("../cardValidation");
      const raw = new Uint8Array(80);
      const grant = makeGrant();
      const signal = new AbortController().signal;

      const result = await decodeAndValidateCard(raw, grant as never, "AA:BB", false, signal);
      expect(result.phase).toBe("error");
      expect(result.error).toBeTruthy();
    });

    it("returns ready with warning when tenant bind is invalid offline (lenient)", async () => {
      mockIsTenantBindValid.mockReturnValue(false);

      const { decodeAndValidateCard } = await import("../cardValidation");
      const raw = new Uint8Array(80);
      const grant = makeGrant();
      const signal = new AbortController().signal;

      const result = await decodeAndValidateCard(raw, grant as never, "AA:BB", true, signal);
      expect(result.phase).toBe("ready");
      expect(result.warning).toBeTruthy();
    });
  });
});
