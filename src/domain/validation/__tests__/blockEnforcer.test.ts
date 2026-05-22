import { describe, it, expect, vi, beforeEach } from "vitest";
import { CardStatus } from "../../payload/types";
import type { Card } from "#/infrastructure/persistence/dexie/localDb";
import { stubCard } from "../../nfc/__tests__/fixtures";

// Mock the local-db module
vi.mock("#/infrastructure/persistence/dexie/localDb", () => ({
  localDb: {
    cards: {
      get: vi.fn().mockResolvedValue(null),
      update: vi.fn().mockResolvedValue(undefined),
      put: vi.fn().mockResolvedValue(undefined),
    },
  },
}));

import {
  checkBlockedSync,
  checkBlocked,
  enforceOnCheckin,
  enforceOnCheckout,
  applyAdminBlock,
} from "../blockEnforcer";
import { localDb } from "#/infrastructure/persistence/dexie/localDb";

describe("blockEnforcer", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

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
      vi.mocked(localDb.cards.get).mockResolvedValue(null);
      const result = await checkBlocked("t1", "card1");
      expect(result.blocked).toBe(false);
    });

    it("returns blocked:true immediately for blocked on-card status without DB lookup", async () => {
      const result = await checkBlocked("t1", "card1", CardStatus.BLOCKED_TAMPER);
      expect(result.blocked).toBe(true);
      // Should not have called DB since on-card status is already blocked
      expect(localDb.cards.get).not.toHaveBeenCalled();
    });

    it("checks DB when on-card status is ACTIVE", async () => {
      vi.mocked(localDb.cards.get).mockResolvedValue(stubCard("blocked_admin"));
      const result = await checkBlocked("t1", "card1", CardStatus.ACTIVE);
      expect(result.blocked).toBe(true);
      expect(localDb.cards.get).toHaveBeenCalledWith(["t1", "card1"]);
    });
  });

  describe("enforceOnCheckin", () => {
    it("delegates to checkBlocked", async () => {
      vi.mocked(localDb.cards.get).mockResolvedValue(null);
      const result = await enforceOnCheckin("t1", "card1");
      expect(result.blocked).toBe(false);
    });
  });

  describe("enforceOnCheckout", () => {
    it("delegates to checkBlocked", async () => {
      vi.mocked(localDb.cards.get).mockResolvedValue(null);
      const result = await enforceOnCheckout("t1", "card1");
      expect(result.blocked).toBe(false);
    });
  });

  describe("applyAdminBlock", () => {
    it("updates existing card to blocked_admin", async () => {
      vi.mocked(localDb.cards.get).mockResolvedValue(stubCard("active"));
      await applyAdminBlock("t1", "c1");
      expect(localDb.cards.update).toHaveBeenCalledWith(["t1", "c1"], { status: "blocked_admin" });
    });

    it("creates new card record when card does not exist", async () => {
      vi.mocked(localDb.cards.get).mockResolvedValue(null);
      await applyAdminBlock("t1", "c1");
      expect(localDb.cards.put).toHaveBeenCalledWith(
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

describe("blockEnforcer — additional coverage", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("checkBlocked — IndexedDB failure handling", () => {
    it("propagates IndexedDB errors (does not swallow them)", async () => {
      vi.mocked(localDb.cards.get).mockRejectedValue(new Error("IndexedDB unavailable"));

      await expect(checkBlocked("t1", "card1", CardStatus.ACTIVE)).rejects.toThrow(
        "IndexedDB unavailable",
      );
    });
  });

  describe("enforceOnCheckin — blocked card paths", () => {
    it("returns blocked:true when DB card is blocked_tamper", async () => {
      vi.mocked(localDb.cards.get).mockResolvedValue(stubCard("blocked_tamper"));
      const result = await enforceOnCheckin("t1", "card1");
      expect(result.blocked).toBe(true);
      expect(result.errorCode).toBe("CARD_BLOCKED_TAMPER");
    });

    it("returns blocked:true when DB card is blocked_admin", async () => {
      vi.mocked(localDb.cards.get).mockResolvedValue(stubCard("blocked_admin"));
      const result = await enforceOnCheckin("t1", "card1");
      expect(result.blocked).toBe(true);
      expect(result.errorCode).toBe("CARD_BLOCKED_ADMIN");
    });

    it("returns blocked:false when DB card is active", async () => {
      vi.mocked(localDb.cards.get).mockResolvedValue(stubCard("active"));
      const result = await enforceOnCheckin("t1", "card1");
      expect(result.blocked).toBe(false);
    });
  });

  describe("enforceOnCheckout — blocked card paths", () => {
    it("returns blocked:true when DB card is blocked_fraud", async () => {
      vi.mocked(localDb.cards.get).mockResolvedValue(stubCard("blocked_fraud"));
      const result = await enforceOnCheckout("t1", "card1");
      expect(result.blocked).toBe(true);
      expect(result.errorCode).toBe("CARD_BLOCKED");
    });

    it("returns blocked:false when card is not in DB", async () => {
      vi.mocked(localDb.cards.get).mockResolvedValue(null);
      const result = await enforceOnCheckout("t1", "card1");
      expect(result.blocked).toBe(false);
    });
  });

  describe("applyAdminBlock — timestamp fields", () => {
    it("sets createdAt and lastActivityAt to current unix timestamp when creating", async () => {
      vi.mocked(localDb.cards.get).mockResolvedValue(null);
      const before = Math.floor(Date.now() / 1000);

      await applyAdminBlock("t1", "c1");

      const after = Math.floor(Date.now() / 1000);
      const putCall = vi.mocked(localDb.cards.put).mock.calls[0][0] as Card;
      expect(putCall.createdAt).toBeGreaterThanOrEqual(before);
      expect(putCall.createdAt).toBeLessThanOrEqual(after);
      expect(putCall.lastActivityAt).toBeGreaterThanOrEqual(before);
      expect(putCall.lastActivityAt as number).toBeLessThanOrEqual(after);
    });

    it("sets userId to null when creating a new blocked record", async () => {
      vi.mocked(localDb.cards.get).mockResolvedValue(null);
      await applyAdminBlock("t1", "c1");
      const putCall = vi.mocked(localDb.cards.put).mock.calls[0][0] as Card;
      expect(putCall.userId).toBeNull();
    });

    it("does not call put when card already exists (only update)", async () => {
      vi.mocked(localDb.cards.get).mockResolvedValue(stubCard("active"));
      await applyAdminBlock("t1", "c1");
      expect(localDb.cards.put).not.toHaveBeenCalled();
      expect(localDb.cards.update).toHaveBeenCalledOnce();
    });
  });

  describe("checkBlockedSync — message content", () => {
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
