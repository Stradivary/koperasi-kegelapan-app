// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

const mockGetCurrentDeviceId = vi.fn().mockReturnValue("device-123");
const mockGetAccessToken = vi.fn().mockReturnValue("token-abc");
const mockFetch = vi.fn().mockResolvedValue({ ok: true });

vi.mock("#/infrastructure/api/apiClient", () => ({
  API_BASE_URL: "https://api.test",
  getCurrentDeviceId: () => mockGetCurrentDeviceId(),
  getAccessToken: () => mockGetAccessToken(),
}));

globalThis.fetch = mockFetch;

beforeEach(() => {
  vi.clearAllMocks();
  mockFetch.mockResolvedValue({ ok: true });
  mockGetCurrentDeviceId.mockReturnValue("device-123");
  mockGetAccessToken.mockReturnValue("token-abc");
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("trackError", () => {
  it("calls fetch with the correct endpoint", async () => {
    const { trackError } = await import("../errorTracker");
    trackError({ category: "nfc_write_failure", message: "Write failed" });
    // Give the fire-and-forget a tick to run
    await new Promise((r) => setTimeout(r, 0));
    expect(mockFetch).toHaveBeenCalledWith(
      "https://api.test/api/client-errors",
      expect.objectContaining({ method: "POST" }),
    );
  });

  it("includes category and message in the payload", async () => {
    const { trackError } = await import("../errorTracker");
    trackError({ category: "test_category", message: "test message" });
    await new Promise((r) => setTimeout(r, 0));
    const body = JSON.parse(mockFetch.mock.calls[0][1].body);
    expect(body.category).toBe("test_category");
    expect(body.message).toBe("test message");
  });

  it("includes deviceId in the payload", async () => {
    const { trackError } = await import("../errorTracker");
    trackError({ category: "test", message: "msg" });
    await new Promise((r) => setTimeout(r, 0));
    const body = JSON.parse(mockFetch.mock.calls[0][1].body);
    expect(body.deviceId).toBe("device-123");
  });

  it("includes Authorization header when token is available", async () => {
    const { trackError } = await import("../errorTracker");
    trackError({ category: "test", message: "msg" });
    await new Promise((r) => setTimeout(r, 0));
    const headers = mockFetch.mock.calls[0][1].headers;
    expect(headers["Authorization"]).toBe("Bearer token-abc");
  });

  it("does not include Authorization header when no token", async () => {
    mockGetAccessToken.mockReturnValue(null);
    const { trackError } = await import("../errorTracker");
    trackError({ category: "test", message: "msg" });
    await new Promise((r) => setTimeout(r, 0));
    const headers = mockFetch.mock.calls[0][1].headers;
    expect(headers["Authorization"]).toBeUndefined();
  });

  it("includes context in the payload when provided", async () => {
    const { trackError } = await import("../errorTracker");
    trackError({
      category: "test",
      message: "msg",
      context: { cardId: "abc", attempt: 2 },
    });
    await new Promise((r) => setTimeout(r, 0));
    const body = JSON.parse(mockFetch.mock.calls[0][1].body);
    expect(body.context.cardId).toBe("abc");
    expect(body.context.attempt).toBe(2);
  });

  it("does not throw when fetch fails", async () => {
    mockFetch.mockRejectedValue(new Error("Network error"));
    const { trackError } = await import("../errorTracker");
    expect(() => trackError({ category: "test", message: "msg" })).not.toThrow();
    await new Promise((r) => setTimeout(r, 0));
  });

  it("does not throw when getCurrentDeviceId throws", async () => {
    mockGetCurrentDeviceId.mockImplementation(() => {
      throw new Error("storage error");
    });
    const { trackError } = await import("../errorTracker");
    expect(() => trackError({ category: "test", message: "msg" })).not.toThrow();
  });

  it("includes timestamp in the payload", async () => {
    const before = Date.now();
    const { trackError } = await import("../errorTracker");
    trackError({ category: "test", message: "msg" });
    await new Promise((r) => setTimeout(r, 0));
    const body = JSON.parse(mockFetch.mock.calls[0][1].body);
    expect(body.timestamp).toBeGreaterThanOrEqual(before);
  });
});
