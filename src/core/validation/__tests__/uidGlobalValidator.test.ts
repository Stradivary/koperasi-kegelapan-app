import { describe, it, expect, vi, beforeEach } from "vitest";

import { normalizeUID, validateUIDLocal, validateUID } from "../uidGlobalValidator";
import type { CardRepository } from "../../interfaces/CardRepository";
import type { UIDRemoteValidator } from "../../interfaces/UIDRemoteValidator";
import type { OnlineStatusProvider } from "../../interfaces/OnlineStatusProvider";

// ── Mock Factories ─────────────────────────────────────────────────────

function createMockCardRepo(
  cards: Array<{ cardId: string; tenantId: string; status: string }> = [],
): CardRepository {
  return {
    getByTenantAndCardId: vi.fn(),
    filterByCardIdExcludingDeleted: vi.fn().mockResolvedValue(cards),
    updateStatus: vi.fn(),
    put: vi.fn(),
  };
}

function createMockRemoteValidator(
  response: { exists: boolean; tenantId?: string } = { exists: false },
): UIDRemoteValidator {
  return {
    checkUIDExists: vi.fn().mockResolvedValue(response),
  };
}

function createMockOnlineStatus(online = true): OnlineStatusProvider {
  return {
    isOnline: vi.fn().mockReturnValue(online),
  };
}

describe("uidGlobalValidator", () => {
  beforeEach(() => {
    vi.clearAllMocks();
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
      const cardRepo = createMockCardRepo();
      const result = await validateUIDLocal("abcdef", "t1", { cardRepo });
      expect(result.valid).toBe(false);
      expect(result.reason).toBe("INVALID_UID_FORMAT");
    });

    it("returns invalid for too long UID", async () => {
      const cardRepo = createMockCardRepo();
      const result = await validateUIDLocal("04a2b3c4d5e6f7ff", "t1", { cardRepo });
      expect(result.valid).toBe(false);
      expect(result.reason).toBe("INVALID_UID_FORMAT");
    });

    it("returns valid when card not found locally", async () => {
      const cardRepo = createMockCardRepo([]);
      const result = await validateUIDLocal("04a2b3c4d5e6f7", "t1", { cardRepo });
      expect(result.valid).toBe(true);
    });

    it("returns invalid when card found in same tenant", async () => {
      const cardRepo = createMockCardRepo([
        { cardId: "04a2b3c4d5e6f7", tenantId: "t1", status: "active" },
      ]);
      const result = await validateUIDLocal("04a2b3c4d5e6f7", "t1", { cardRepo });
      expect(result.valid).toBe(false);
      expect(result.reason).toBe("UID_ALREADY_REGISTERED");
    });

    it("returns invalid when card found in different tenant", async () => {
      const cardRepo = createMockCardRepo([
        { cardId: "04a2b3c4d5e6f7", tenantId: "t2", status: "active" },
      ]);
      const result = await validateUIDLocal("04a2b3c4d5e6f7", "t1", { cardRepo });
      expect(result.valid).toBe(false);
      expect(result.reason).toBe("UID_REGISTERED_OTHER_TENANT");
    });
  });

  describe("validateUID", () => {
    it("returns invalid for bad format", async () => {
      const deps = {
        cardRepo: createMockCardRepo(),
        remoteValidator: createMockRemoteValidator(),
        onlineStatus: createMockOnlineStatus(true),
      };
      const result = await validateUID("abc", "t1", deps);
      expect(result.valid).toBe(false);
      expect(result.reason).toBe("INVALID_UID_FORMAT");
    });

    it("returns valid when not found locally or remotely", async () => {
      const deps = {
        cardRepo: createMockCardRepo([]),
        remoteValidator: createMockRemoteValidator({ exists: false }),
        onlineStatus: createMockOnlineStatus(true),
      };
      const result = await validateUID("04a2b3c4d5e6f7", "t1", deps);
      expect(result.valid).toBe(true);
    });

    it("returns invalid when found remotely", async () => {
      const deps = {
        cardRepo: createMockCardRepo([]),
        remoteValidator: createMockRemoteValidator({ exists: true, tenantId: "other-tenant" }),
        onlineStatus: createMockOnlineStatus(true),
      };
      const result = await validateUID("04a2b3c4d5e6f7", "t1", deps);
      expect(result.valid).toBe(false);
      expect(result.reason).toBe("UID_REGISTERED_OTHER_TENANT");
    });

    it("returns NETWORK_ERROR when API call fails", async () => {
      const remoteValidator: UIDRemoteValidator = {
        checkUIDExists: vi.fn().mockRejectedValue(new Error("Network error")),
      };
      const deps = {
        cardRepo: createMockCardRepo([]),
        remoteValidator,
        onlineStatus: createMockOnlineStatus(true),
      };
      const result = await validateUID("04a2b3c4d5e6f7", "t1", deps);
      expect(result.valid).toBe(false);
      expect(result.reason).toBe("NETWORK_ERROR");
    });

    it("returns valid when offline and not found locally", async () => {
      const deps = {
        cardRepo: createMockCardRepo([]),
        remoteValidator: createMockRemoteValidator(),
        onlineStatus: createMockOnlineStatus(false),
      };
      const result = await validateUID("04a2b3c4d5e6f7", "t1", deps);
      expect(result.valid).toBe(true);
    });

    it("skips cloud check when found locally", async () => {
      const remoteValidator = createMockRemoteValidator();
      const deps = {
        cardRepo: createMockCardRepo([
          { cardId: "04a2b3c4d5e6f7", tenantId: "t1", status: "active" },
        ]),
        remoteValidator,
        onlineStatus: createMockOnlineStatus(true),
      };
      const result = await validateUID("04a2b3c4d5e6f7", "t1", deps);
      expect(result.valid).toBe(false);
      expect(remoteValidator.checkUIDExists).not.toHaveBeenCalled();
    });
  });
});
