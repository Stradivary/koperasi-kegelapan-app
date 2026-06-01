import { describe, it, expect, vi } from "vitest";
import { CardStatus } from "../../payload/types";
import type { CardRecord } from "../../interfaces/types";
import type { CardRepository } from "../../interfaces/CardRepository";
import { stubCard } from "../../nfc/__tests__/fixtures";

import {
  checkBlockedSync,
  checkBlocked,
  enforceOnCheckin,
  enforceOnCheckout,
  applyAdminBlock,
} from "../blockEnforcer";

/** Creates a mock CardRepository with configurable behavior */
function createMockCardRepo(overrides: Partial<CardRepository> = {}): CardRepository {
  return {
    getByTenantAndCardId: vi.fn().mockResolvedValue(undefined),
    filterByCardIdExcludingDeleted: vi.fn().mockResolvedValue([]),
    updateStatus: vi.fn().mockResolvedValue(undefined),
    put: vi.fn().mockResolvedValue(undefined),
    ...overrides,
  };
}

describe("blockEnforcer", () => {
  describe("checkBlockedSync", () => {
    it("returns blocked:false when no status and no DB card", () => {
      const result = checkBlockedSync(undefined, null);
      expect(result.blocked).toBe(false);
    });

    it("returns blocked:false for ACTIVE on-card status", () => {
      const result = checkBlockedSync(CardStatus.ACTIVE, null);
      expect(result.blocked).toBe(false);
    });

    it("returns blocked:true for BLOCKED_TAMPER on-card status", () => {
      const result = checkBlockedSync(CardStatus.BLOCKED_TAMPER, null);
      expect(result.blocked).toBe(true);
      expect(result.errorCode).toBe("CARD_BLOCKED_TAMPER");
      expect(result.message).toContain("Diblokir");
    });

    it("returns blocked:true for BLOCKED_FRAUD on-card status", () => {
      const result = checkBlockedSync(CardStatus.BLOCKED_FRAUD, null);
      expect(result.blocked).toBe(true);
      expect(result.errorCode).toBe("CARD_BLOCKED");
    });

    it("returns blocked:true for BLOCKED_EXPIRED on-card status", () => {
      const result = checkBlockedSync(CardStatus.BLOCKED_EXPIRED, null);
      expect(result.blocked).toBe(true);
      expect(result.errorCode).toBe("CARD_BLOCKED");
    });

    it("returns blocked:true for BLOCKED_ADMIN on-card status", () => {
      const result = checkBlockedSync(CardStatus.BLOCKED_ADMIN, null);
      expect(result.blocked).toBe(true);
      expect(result.errorCode).toBe("CARD_BLOCKED_ADMIN");
    });

    it("returns blocked:true when DB card has blocked_tamper status", () => {
      const result = checkBlockedSync(undefined, stubCard("blocked_tamper"));
      expect(result.blocked).toBe(true);
      expect(result.errorCode).toBe("CARD_BLOCKED_TAMPER");
    });

    it("returns blocked:true when DB card has blocked_fraud status", () => {
      const result = checkBlockedSync(undefined, stubCard("blocked_fraud"));
      expect(result.blocked).toBe(true);
      expect(result.errorCode).toBe("CARD_BLOCKED");
    });

    it("returns blocked:true when DB card has blocked_expired status", () => {
      const result = checkBlockedSync(undefined, stubCard("blocked_expired"));
      expect(result.blocked).toBe(true);
      expect(result.errorCode).toBe("CARD_BLOCKED");
    });

    it("returns blocked:true when DB card has blocked_admin status", () => {
      const result = checkBlockedSync(undefined, stubCard("blocked_admin"));
      expect(result.blocked).toBe(true);
      expect(result.errorCode).toBe("CARD_BLOCKED_ADMIN");
    });

    it("returns blocked:false when DB card has active status", () => {
      const result = checkBlockedSync(undefined, stubCard("active"));
      expect(result.blocked).toBe(false);
    });

    it("on-card status takes priority over DB card", () => {
      const result = checkBlockedSync(CardStatus.BLOCKED_ADMIN, stubCard("active"));
      expect(result.blocked).toBe(true);
      expect(result.errorCode).toBe("CARD_BLOCKED_ADMIN");
    });
  });

  describe("checkBlocked", () => {
    it("returns blocked:false when card not in DB and no on-card status", async () => {
      const mockRepo = createMockCardRepo();
      const result = await checkBlocked("t1", "card1", { cardRepo: mockRepo });
      expect(result.blocked).toBe(false);
    });

    it("returns blocked:true immediately for blocked on-card status without DB lookup", async () => {
      const mockRepo = createMockCardRepo();
      const result = await checkBlocked(
        "t1",
        "card1",
        { cardRepo: mockRepo },
        CardStatus.BLOCKED_TAMPER,
      );
      expect(result.blocked).toBe(true);
      // Should not have called DB since on-card status is already blocked
      expect(mockRepo.getByTenantAndCardId).not.toHaveBeenCalled();
    });

    it("checks DB when on-card status is ACTIVE", async () => {
      const mockRepo = createMockCardRepo({
        getByTenantAndCardId: vi.fn().mockResolvedValue(stubCard("blocked_admin")),
      });
      const result = await checkBlocked("t1", "card1", { cardRepo: mockRepo }, CardStatus.ACTIVE);
      expect(result.blocked).toBe(true);
      expect(mockRepo.getByTenantAndCardId).toHaveBeenCalledWith("t1", "card1");
    });
  });

  describe("enforceOnCheckin", () => {
    it("delegates to checkBlocked", async () => {
      const mockRepo = createMockCardRepo();
      const result = await enforceOnCheckin("t1", "card1", { cardRepo: mockRepo });
      expect(result.blocked).toBe(false);
    });
  });

  describe("enforceOnCheckout", () => {
    it("delegates to checkBlocked", async () => {
      const mockRepo = createMockCardRepo();
      const result = await enforceOnCheckout("t1", "card1", { cardRepo: mockRepo });
      expect(result.blocked).toBe(false);
    });
  });

  describe("applyAdminBlock", () => {
    it("updates existing card to blocked_admin", async () => {
      const mockRepo = createMockCardRepo({
        getByTenantAndCardId: vi.fn().mockResolvedValue(stubCard("active")),
      });
      await applyAdminBlock("t1", "c1", { cardRepo: mockRepo });
      expect(mockRepo.updateStatus).toHaveBeenCalledWith("t1", "c1", "blocked_admin");
    });

    it("creates new card record when card does not exist", async () => {
      const mockRepo = createMockCardRepo();
      await applyAdminBlock("t1", "c1", { cardRepo: mockRepo });
      expect(mockRepo.put).toHaveBeenCalledWith(
        expect.objectContaining({
          tenantId: "t1",
          cardId: "c1",
          status: "blocked_admin",
        }),
      );
    });
  });
});

// ---------------------------------------------------------------------------
// Additional coverage: gaps identified in analysis
// ---------------------------------------------------------------------------

describe("blockEnforcer - additional coverage", () => {
  describe("checkBlocked - IndexedDB failure handling", () => {
    it("propagates IndexedDB errors (does not swallow them)", async () => {
      const mockRepo = createMockCardRepo({
        getByTenantAndCardId: vi.fn().mockRejectedValue(new Error("IndexedDB unavailable")),
      });

      await expect(
        checkBlocked("t1", "card1", { cardRepo: mockRepo }, CardStatus.ACTIVE),
      ).rejects.toThrow("IndexedDB unavailable");
    });
  });

  describe("enforceOnCheckin - blocked card paths", () => {
    it("returns blocked:true when DB card is blocked_tamper", async () => {
      const mockRepo = createMockCardRepo({
        getByTenantAndCardId: vi.fn().mockResolvedValue(stubCard("blocked_tamper")),
      });
      const result = await enforceOnCheckin("t1", "card1", { cardRepo: mockRepo });
      expect(result.blocked).toBe(true);
      expect(result.errorCode).toBe("CARD_BLOCKED_TAMPER");
    });

    it("returns blocked:true when DB card is blocked_admin", async () => {
      const mockRepo = createMockCardRepo({
        getByTenantAndCardId: vi.fn().mockResolvedValue(stubCard("blocked_admin")),
      });
      const result = await enforceOnCheckin("t1", "card1", { cardRepo: mockRepo });
      expect(result.blocked).toBe(true);
      expect(result.errorCode).toBe("CARD_BLOCKED_ADMIN");
    });

    it("returns blocked:false when DB card is active", async () => {
      const mockRepo = createMockCardRepo({
        getByTenantAndCardId: vi.fn().mockResolvedValue(stubCard("active")),
      });
      const result = await enforceOnCheckin("t1", "card1", { cardRepo: mockRepo });
      expect(result.blocked).toBe(false);
    });
  });

  describe("enforceOnCheckout - blocked card paths", () => {
    it("returns blocked:true when DB card is blocked_fraud", async () => {
      const mockRepo = createMockCardRepo({
        getByTenantAndCardId: vi.fn().mockResolvedValue(stubCard("blocked_fraud")),
      });
      const result = await enforceOnCheckout("t1", "card1", { cardRepo: mockRepo });
      expect(result.blocked).toBe(true);
      expect(result.errorCode).toBe("CARD_BLOCKED");
    });

    it("returns blocked:false when card is not in DB", async () => {
      const mockRepo = createMockCardRepo();
      const result = await enforceOnCheckout("t1", "card1", { cardRepo: mockRepo });
      expect(result.blocked).toBe(false);
    });
  });

  describe("applyAdminBlock - timestamp fields", () => {
    it("sets createdAt and lastActivityAt to current unix timestamp when creating", async () => {
      const mockRepo = createMockCardRepo();
      const before = Math.floor(Date.now() / 1000);

      await applyAdminBlock("t1", "c1", { cardRepo: mockRepo });

      const after = Math.floor(Date.now() / 1000);
      const putCall = vi.mocked(mockRepo.put).mock.calls[0][0] as CardRecord;
      expect(putCall.createdAt).toBeGreaterThanOrEqual(before);
      expect(putCall.createdAt).toBeLessThanOrEqual(after);
      expect(putCall.lastActivityAt).toBeGreaterThanOrEqual(before);
      expect(putCall.lastActivityAt as number).toBeLessThanOrEqual(after);
    });

    it("sets userId to null when creating a new blocked record", async () => {
      const mockRepo = createMockCardRepo();
      await applyAdminBlock("t1", "c1", { cardRepo: mockRepo });
      const putCall = vi.mocked(mockRepo.put).mock.calls[0][0] as CardRecord;
      expect(putCall.userId).toBeNull();
    });

    it("does not call put when card already exists (only update)", async () => {
      const mockRepo = createMockCardRepo({
        getByTenantAndCardId: vi.fn().mockResolvedValue(stubCard("active")),
      });
      await applyAdminBlock("t1", "c1", { cardRepo: mockRepo });
      expect(mockRepo.put).not.toHaveBeenCalled();
      expect(mockRepo.updateStatus).toHaveBeenCalledOnce();
    });
  });

  describe("checkBlockedSync - message content", () => {
    it("includes 'Diblokir' in the message for all blocked statuses", () => {
      const statuses = [
        CardStatus.BLOCKED_TAMPER,
        CardStatus.BLOCKED_FRAUD,
        CardStatus.BLOCKED_EXPIRED,
        CardStatus.BLOCKED_ADMIN,
      ];
      for (const status of statuses) {
        const result = checkBlockedSync(status, null);
        expect(result.message).toContain("Diblokir");
      }
    });

    it("returns no message when not blocked", () => {
      const result = checkBlockedSync(CardStatus.ACTIVE, null);
      expect(result.message).toBeUndefined();
    });
  });
});
