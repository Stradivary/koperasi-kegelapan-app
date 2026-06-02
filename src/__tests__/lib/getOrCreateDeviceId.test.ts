// @vitest-environment jsdom
/**
 * Tests for src/lib/getOrCreateDeviceId.tsx
 * Covers: getDeviceFingerprint (cache, compute), getOrCreateDeviceId (create, reuse)
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

// jsdom doesn't implement canvas.getContext("2d") — stub it so computeFingerprint works
const mockCtx = {
  fillStyle: "",
  fillRect: vi.fn(),
  font: "",
  fillText: vi.fn(),
  beginPath: vi.fn(),
  arc: vi.fn(),
  fill: vi.fn(),
};
HTMLCanvasElement.prototype.getContext = vi
  .fn()
  .mockReturnValue(mockCtx) as typeof HTMLCanvasElement.prototype.getContext;
HTMLCanvasElement.prototype.toDataURL = vi.fn().mockReturnValue("data:image/png;base64,mock");

describe("getOrCreateDeviceId", () => {
  beforeEach(() => {
    localStorage.clear();
    vi.clearAllMocks();
  });

  it("creates and stores a new UUID when none exists", async () => {
    const { getOrCreateDeviceId } = await import("#/infrastructure/device/getOrCreateDeviceId");
    const id = getOrCreateDeviceId();
    expect(id).toBeTruthy();
    expect(typeof id).toBe("string");
    expect(localStorage.getItem("koperasi-device-id")).toBe(id);
  });

  it("returns the same UUID on subsequent calls", async () => {
    const { getOrCreateDeviceId } = await import("#/infrastructure/device/getOrCreateDeviceId");
    const id1 = getOrCreateDeviceId();
    const id2 = getOrCreateDeviceId();
    expect(id1).toBe(id2);
  });

  it("returns existing UUID from localStorage", async () => {
    localStorage.setItem("koperasi-device-id", "existing-uuid-1234");
    const { getOrCreateDeviceId } = await import("#/infrastructure/device/getOrCreateDeviceId");
    const id = getOrCreateDeviceId();
    expect(id).toBe("existing-uuid-1234");
  });
});

describe("getDeviceFingerprint", () => {
  beforeEach(() => {
    localStorage.clear();
    vi.clearAllMocks();
  });

  it("returns a cached fingerprint from localStorage", async () => {
    localStorage.setItem("koperasi-device-fp", "cached-fp-abc123");
    const { getDeviceFingerprint } = await import("#/infrastructure/device/getOrCreateDeviceId");
    const fp = await getDeviceFingerprint();
    expect(fp).toBe("cached-fp-abc123");
  });

  it("computes and caches fingerprint when not cached", async () => {
    const { getDeviceFingerprint } = await import("#/infrastructure/device/getOrCreateDeviceId");
    const fp = await getDeviceFingerprint();
    expect(typeof fp).toBe("string");
    expect(fp.length).toBe(32);
    expect(localStorage.getItem("koperasi-device-fp")).toBe(fp);
  });

  it("returns the same fingerprint on subsequent calls (cache hit)", async () => {
    const { getDeviceFingerprint } = await import("#/infrastructure/device/getOrCreateDeviceId");
    const fp1 = await getDeviceFingerprint();
    const fp2 = await getDeviceFingerprint();
    expect(fp1).toBe(fp2);
  });

  it("fingerprint is a 32-char hex string", async () => {
    const { getDeviceFingerprint } = await import("#/infrastructure/device/getOrCreateDeviceId");
    const fp = await getDeviceFingerprint();
    expect(fp).toMatch(/^[0-9a-f]{32}$/);
  });
});
