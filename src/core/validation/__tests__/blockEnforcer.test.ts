/**
 * Unit tests for BlockEnforcer
 *
 * Tests the block enforcement logic for:
 * - On-card status blocking (authoritative)
 * - Local DB record blocking (fallback)
 * - Error code mapping per block type
 * - Message inclusion in all block responses
 * - Non-blocked (active) card pass-through
 *
 * @see Requirements 6.1, 6.2, 6.3, 6.4, 6.5, 6.6, 6.7
 */

import { describe, it, expect } from "vitest";
import { checkBlockedSync } from "../blockEnforcer";
import { CardStatus } from "../../payload/types";
import type { Card } from "../../../db/local-db";

const BLOCKED_MESSAGE = "Akses Ditolak: Kartu Diblokir";

function makeCard(status: Card["status"]): Card {
  return {
    tenantId: "tenant-1",
    cardId: "aabbccdd",
    userId: 1,
    status,
    balance: 50000,
    counter: 5,
    keyVersion: 1,
    createdAt: 1700000000,
    lastActivityAt: 1700000000,
    expiresAt: null,
    notes: null,
  };
}

describe("checkBlockedSync", () => {
  describe("on-card status blocking (Requirement 6.4)", () => {
    it("should block when on-card status is BLOCKED_ADMIN", () => {
      const result = checkBlockedSync(CardStatus.BLOCKED_ADMIN);

      expect(result.blocked).toBe(true);
      expect(result.message).toBe(BLOCKED_MESSAGE);
      expect(result.errorCode).toBe("CARD_BLOCKED_ADMIN");
      expect(result.status).toBe(CardStatus.BLOCKED_ADMIN);
    });

    it("should block when on-card status is BLOCKED_TAMPER", () => {
      const result = checkBlockedSync(CardStatus.BLOCKED_TAMPER);

      expect(result.blocked).toBe(true);
      expect(result.message).toBe(BLOCKED_MESSAGE);
      expect(result.errorCode).toBe("CARD_BLOCKED_TAMPER");
      expect(result.status).toBe(CardStatus.BLOCKED_TAMPER);
    });

    it("should block when on-card status is BLOCKED_FRAUD", () => {
      const result = checkBlockedSync(CardStatus.BLOCKED_FRAUD);

      expect(result.blocked).toBe(true);
      expect(result.message).toBe(BLOCKED_MESSAGE);
      expect(result.errorCode).toBe("CARD_BLOCKED");
      expect(result.status).toBe(CardStatus.BLOCKED_FRAUD);
    });

    it("should block when on-card status is BLOCKED_EXPIRED", () => {
      const result = checkBlockedSync(CardStatus.BLOCKED_EXPIRED);

      expect(result.blocked).toBe(true);
      expect(result.message).toBe(BLOCKED_MESSAGE);
      expect(result.errorCode).toBe("CARD_BLOCKED");
      expect(result.status).toBe(CardStatus.BLOCKED_EXPIRED);
    });

    it("should block on-card even if local DB shows active (Requirement 6.4)", () => {
      const activeCard = makeCard("active");
      const result = checkBlockedSync(CardStatus.BLOCKED_ADMIN, activeCard);

      expect(result.blocked).toBe(true);
      expect(result.errorCode).toBe("CARD_BLOCKED_ADMIN");
    });
  });

  describe("local DB record blocking (Requirement 6.5)", () => {
    it("should block when local DB shows blocked_admin", () => {
      const card = makeCard("blocked_admin");
      const result = checkBlockedSync(undefined, card);

      expect(result.blocked).toBe(true);
      expect(result.message).toBe(BLOCKED_MESSAGE);
      expect(result.errorCode).toBe("CARD_BLOCKED_ADMIN");
    });

    it("should block when local DB shows blocked_tamper", () => {
      const card = makeCard("blocked_tamper");
      const result = checkBlockedSync(undefined, card);

      expect(result.blocked).toBe(true);
      expect(result.message).toBe(BLOCKED_MESSAGE);
      expect(result.errorCode).toBe("CARD_BLOCKED_TAMPER");
    });

    it("should block when local DB shows blocked_fraud", () => {
      const card = makeCard("blocked_fraud");
      const result = checkBlockedSync(undefined, card);

      expect(result.blocked).toBe(true);
      expect(result.message).toBe(BLOCKED_MESSAGE);
      expect(result.errorCode).toBe("CARD_BLOCKED");
    });

    it("should block when local DB shows blocked_expired", () => {
      const card = makeCard("blocked_expired");
      const result = checkBlockedSync(undefined, card);

      expect(result.blocked).toBe(true);
      expect(result.message).toBe(BLOCKED_MESSAGE);
      expect(result.errorCode).toBe("CARD_BLOCKED");
    });
  });

  describe("non-blocked pass-through", () => {
    it("should not block when on-card status is ACTIVE", () => {
      const result = checkBlockedSync(CardStatus.ACTIVE);

      expect(result.blocked).toBe(false);
      expect(result.message).toBeUndefined();
      expect(result.errorCode).toBeUndefined();
    });

    it("should not block when local DB shows active", () => {
      const card = makeCard("active");
      const result = checkBlockedSync(undefined, card);

      expect(result.blocked).toBe(false);
    });

    it("should not block when both on-card and local DB are active", () => {
      const card = makeCard("active");
      const result = checkBlockedSync(CardStatus.ACTIVE, card);

      expect(result.blocked).toBe(false);
    });

    it("should not block when no card record exists and no on-card status", () => {
      const result = checkBlockedSync(undefined, null);

      expect(result.blocked).toBe(false);
    });
  });

  describe("error code mapping (Requirement 6.6)", () => {
    it("maps BLOCKED_ADMIN to CARD_BLOCKED_ADMIN", () => {
      const result = checkBlockedSync(CardStatus.BLOCKED_ADMIN);
      expect(result.errorCode).toBe("CARD_BLOCKED_ADMIN");
    });

    it("maps BLOCKED_TAMPER to CARD_BLOCKED_TAMPER", () => {
      const result = checkBlockedSync(CardStatus.BLOCKED_TAMPER);
      expect(result.errorCode).toBe("CARD_BLOCKED_TAMPER");
    });

    it("maps BLOCKED_FRAUD to CARD_BLOCKED", () => {
      const result = checkBlockedSync(CardStatus.BLOCKED_FRAUD);
      expect(result.errorCode).toBe("CARD_BLOCKED");
    });

    it("maps BLOCKED_EXPIRED to CARD_BLOCKED", () => {
      const result = checkBlockedSync(CardStatus.BLOCKED_EXPIRED);
      expect(result.errorCode).toBe("CARD_BLOCKED");
    });
  });

  describe("message inclusion (Requirement 6.3)", () => {
    it("includes 'Akses Ditolak: Kartu Diblokir' in all block responses", () => {
      const statuses = [
        CardStatus.BLOCKED_ADMIN,
        CardStatus.BLOCKED_TAMPER,
        CardStatus.BLOCKED_FRAUD,
        CardStatus.BLOCKED_EXPIRED,
      ];

      for (const status of statuses) {
        const result = checkBlockedSync(status);
        expect(result.message).toBe(BLOCKED_MESSAGE);
      }
    });
  });
});
