import { describe, it, expect, vi, beforeEach } from "vitest";

// Mock local-db
vi.mock("../../../db/local-db", () => ({
  localDb: {
    cards: {
      filter: vi.fn().mockReturnValue({ toArray: vi.fn().mockResolvedValue([]) }),
    },
  },
}));

// Mock api module
vi.mock("../../../lib/api", () => ({
  API_BASE_URL: "https://test-api.example.com",
  apiFetch: vi
    .fn()
    .mockResolvedValue(new Response(JSON.stringify({ exists: false }), { status: 200 })),
}));

import { normalizeUID, validateUIDLocal, validateUID } from "../uidGlobalValidator";
import { localDb } from "../../../db/local-db";
import { apiFetch } from "../../../lib/api";

describe("uidGlobalValidator", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(localDb.cards.filter).mockReturnValue({
      toArray: vi.fn().mockResolvedValue([]),
    } as any);
  });

  describe("normalizeUID", () => {
    it("removes colons", () => {
      expect(normalizeUID("04:A2:B3:C4:D5:E6:F7")).toBe("04a2b3c4d5e6f7");
    });

    it("removes dashes", () => {
      expect(normalizeUID("04-A2-B3-C4")).toBe("04a2b3c4");
    });

    it("converts to lowercase", () => {
      expect(normalizeUID("04A2B3C4")).toBe("04a2b3c4");
    });

    it("handles already normalized input", () => {
      expect(normalizeUID("04a2b3c4d5e6f7")).toBe("04a2b3c4d5e6f7");
    });

    it("strips non-hex characters", () => {
      expect(normalizeUID("04 A2 B3 C4")).toBe("04a2b3c4");
    });
  });

  describe("validateUIDLocal", () => {
    it("returns invalid for too short UID", async () => {
      const result = await validateUIDLocal("abcdef", "t1");
      expect(result.valid).toBe(false);
      expect(result.reason).toBe("INVALID_UID_FORMAT");
    });

    it("returns invalid for too long UID", async () => {
      const result = await validateUIDLocal("04a2b3c4d5e6f7ff", "t1");
      expect(result.valid).toBe(false);
      expect(result.reason).toBe("INVALID_UID_FORMAT");
    });

    it("returns valid when card not found locally", async () => {
      const result = await validateUIDLocal("04a2b3c4d5e6f7", "t1");
      expect(result.valid).toBe(true);
    });

    it("returns invalid when card found in same tenant", async () => {
      vi.mocked(localDb.cards.filter).mockReturnValue({
        toArray: vi
          .fn()
          .mockResolvedValue([{ cardId: "04a2b3c4d5e6f7", tenantId: "t1", status: "active" }]),
      } as any);
      const result = await validateUIDLocal("04a2b3c4d5e6f7", "t1");
      expect(result.valid).toBe(false);
      expect(result.reason).toBe("UID_ALREADY_REGISTERED");
    });

    it("returns invalid when card found in different tenant", async () => {
      vi.mocked(localDb.cards.filter).mockReturnValue({
        toArray: vi
          .fn()
          .mockResolvedValue([{ cardId: "04a2b3c4d5e6f7", tenantId: "t2", status: "active" }]),
      } as any);
      const result = await validateUIDLocal("04a2b3c4d5e6f7", "t1");
      expect(result.valid).toBe(false);
      expect(result.reason).toBe("UID_REGISTERED_OTHER_TENANT");
    });
  });

  describe("validateUID", () => {
    beforeEach(() => {
      vi.stubGlobal("navigator", { onLine: true });
    });

    it("returns invalid for bad format", async () => {
      const result = await validateUID("abc", "t1");
      expect(result.valid).toBe(false);
      expect(result.reason).toBe("INVALID_UID_FORMAT");
    });

    it("returns valid when not found locally or remotely", async () => {
      vi.mocked(apiFetch).mockResolvedValue(
        new Response(JSON.stringify({ exists: false }), { status: 200 }),
      );
      const result = await validateUID("04a2b3c4d5e6f7", "t1");
      expect(result.valid).toBe(true);
    });

    it("returns invalid when found remotely", async () => {
      vi.mocked(apiFetch).mockResolvedValue(
        new Response(JSON.stringify({ exists: true, tenantId: "other-tenant" }), { status: 200 }),
      );
      const result = await validateUID("04a2b3c4d5e6f7", "t1");
      expect(result.valid).toBe(false);
      expect(result.reason).toBe("UID_REGISTERED_OTHER_TENANT");
    });

    it("returns NETWORK_ERROR when API call fails", async () => {
      vi.mocked(apiFetch).mockRejectedValue(new Error("Network error"));
      const result = await validateUID("04a2b3c4d5e6f7", "t1");
      expect(result.valid).toBe(false);
      expect(result.reason).toBe("NETWORK_ERROR");
    });

    it("returns valid when offline and not found locally", async () => {
      vi.stubGlobal("navigator", { onLine: false });
      const result = await validateUID("04a2b3c4d5e6f7", "t1");
      expect(result.valid).toBe(true);
    });

    it("skips cloud check when found locally", async () => {
      vi.mocked(localDb.cards.filter).mockReturnValue({
        toArray: vi
          .fn()
          .mockResolvedValue([{ cardId: "04a2b3c4d5e6f7", tenantId: "t1", status: "active" }]),
      } as any);
      const result = await validateUID("04a2b3c4d5e6f7", "t1");
      expect(result.valid).toBe(false);
      expect(apiFetch).not.toHaveBeenCalled();
    });
  });
});
