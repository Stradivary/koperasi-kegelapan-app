/**
 * Unit tests for checkLocalBlockedStatus - offline block enforcement via repositories.
 *
 * Covers all branches:
 * - Card not found in local DB
 * - Card found but blocked (all blocked_* statuses)
 * - Card found and active, no linked user
 * - Card found and active, linked user is active
 * - Card found and active, linked user is suspended
 * - Serial number normalization (colons, dashes, mixed case)
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { checkLocalBlockedStatus } from "../localStatusCheck";
import type { CardRepository } from "../../interfaces/CardRepository";
import type { UserRepository } from "../../interfaces/UserRepository";
import { makeCard, makeUser, BLOCKED_CARD_STATUSES } from "./fixtures";

// ---------------------------------------------------------------------------
// Mock repository factories
// ---------------------------------------------------------------------------

function createMockCardRepo(overrides: Partial<CardRepository> = {}): CardRepository {
  return {
    getByTenantAndCardId: vi.fn().mockResolvedValue(undefined),
    filterByCardIdExcludingDeleted: vi.fn().mockResolvedValue([]),
    updateStatus: vi.fn().mockResolvedValue(undefined),
    put: vi.fn().mockResolvedValue(undefined),
    ...overrides,
  };
}

function createMockUserRepo(overrides: Partial<UserRepository> = {}): UserRepository {
  return {
    getByTenantAndUserId: vi.fn().mockResolvedValue(undefined),
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("checkLocalBlockedStatus", () => {
  let cardRepo: CardRepository;
  let userRepo: UserRepository;

  beforeEach(() => {
    cardRepo = createMockCardRepo();
    userRepo = createMockUserRepo();
  });

  // -------------------------------------------------------------------------
  // Card not found
  // -------------------------------------------------------------------------

  describe("card not found in local DB", () => {
    it("returns blocked=false, notInLocalDb=true when card is missing", async () => {
      vi.mocked(cardRepo.getByTenantAndCardId).mockResolvedValue(undefined);

      const result = await checkLocalBlockedStatus("tenant-1", "04:A2:B3:C4:D5:E6:F7", {
        cardRepo,
        userRepo,
      });

      expect(result.blocked).toBe(false);
      expect(result.reason).toBeNull();
      expect(result.notInLocalDb).toBe(true);
    });

    it("does not look up users when card is not found", async () => {
      vi.mocked(cardRepo.getByTenantAndCardId).mockResolvedValue(undefined);

      await checkLocalBlockedStatus("tenant-1", "04a2b3c4d5e6f7", { cardRepo, userRepo });

      expect(userRepo.getByTenantAndUserId).not.toHaveBeenCalled();
    });
  });

  // -------------------------------------------------------------------------
  // Blocked card statuses
  // -------------------------------------------------------------------------

  describe("blocked card statuses", () => {
    const blockedStatuses = BLOCKED_CARD_STATUSES;

    for (const status of blockedStatuses) {
      it(`returns blocked=true for status '${status}'`, async () => {
        vi.mocked(cardRepo.getByTenantAndCardId).mockResolvedValue(makeCard({ status }));

        const result = await checkLocalBlockedStatus("tenant-1", "04a2b3c4d5e6f7", {
          cardRepo,
          userRepo,
        });

        expect(result.blocked).toBe(true);
        expect(result.notInLocalDb).toBe(false);
      });

      it(`includes the status suffix in the reason for '${status}'`, async () => {
        vi.mocked(cardRepo.getByTenantAndCardId).mockResolvedValue(makeCard({ status }));

        const result = await checkLocalBlockedStatus("tenant-1", "04a2b3c4d5e6f7", {
          cardRepo,
          userRepo,
        });

        const expectedSuffix = status.replaceAll("blocked_", "");
        expect(result.reason).toContain(expectedSuffix);
      });

      it(`does not look up users when card is blocked (${status})`, async () => {
        vi.mocked(cardRepo.getByTenantAndCardId).mockResolvedValue(makeCard({ status }));

        await checkLocalBlockedStatus("tenant-1", "04a2b3c4d5e6f7", { cardRepo, userRepo });

        expect(userRepo.getByTenantAndUserId).not.toHaveBeenCalled();
      });
    }
  });

  // -------------------------------------------------------------------------
  // Active card, no linked user
  // -------------------------------------------------------------------------

  describe("active card with no linked user", () => {
    it("returns blocked=false when card is active and userId is null", async () => {
      vi.mocked(cardRepo.getByTenantAndCardId).mockResolvedValue(makeCard({ userId: null }));

      const result = await checkLocalBlockedStatus("tenant-1", "04a2b3c4d5e6f7", {
        cardRepo,
        userRepo,
      });

      expect(result.blocked).toBe(false);
      expect(result.reason).toBeNull();
      expect(result.notInLocalDb).toBe(false);
    });

    it("does not look up users when userId is null", async () => {
      vi.mocked(cardRepo.getByTenantAndCardId).mockResolvedValue(makeCard({ userId: null }));

      await checkLocalBlockedStatus("tenant-1", "04a2b3c4d5e6f7", { cardRepo, userRepo });

      expect(userRepo.getByTenantAndUserId).not.toHaveBeenCalled();
    });
  });

  // -------------------------------------------------------------------------
  // Active card, linked user active
  // -------------------------------------------------------------------------

  describe("active card with active linked user", () => {
    it("returns blocked=false when both card and user are active", async () => {
      vi.mocked(cardRepo.getByTenantAndCardId).mockResolvedValue(makeCard({ userId: "user-abc" }));
      vi.mocked(userRepo.getByTenantAndUserId).mockResolvedValue(makeUser({ status: "active" }));

      const result = await checkLocalBlockedStatus("tenant-1", "04a2b3c4d5e6f7", {
        cardRepo,
        userRepo,
      });

      expect(result.blocked).toBe(false);
      expect(result.reason).toBeNull();
      expect(result.notInLocalDb).toBe(false);
    });

    it("looks up user with correct tenantId and userId", async () => {
      vi.mocked(cardRepo.getByTenantAndCardId).mockResolvedValue(
        makeCard({ userId: "user-abc", tenantId: "tenant-1" }),
      );
      vi.mocked(userRepo.getByTenantAndUserId).mockResolvedValue(makeUser({ status: "active" }));

      await checkLocalBlockedStatus("tenant-1", "04a2b3c4d5e6f7", { cardRepo, userRepo });

      expect(userRepo.getByTenantAndUserId).toHaveBeenCalledWith("tenant-1", "user-abc");
    });
  });

  // -------------------------------------------------------------------------
  // Active card, linked user suspended
  // -------------------------------------------------------------------------

  describe("active card with suspended linked user", () => {
    it("returns blocked=true when user is suspended", async () => {
      vi.mocked(cardRepo.getByTenantAndCardId).mockResolvedValue(makeCard({ userId: "user-abc" }));
      vi.mocked(userRepo.getByTenantAndUserId).mockResolvedValue(makeUser({ status: "suspended" }));

      const result = await checkLocalBlockedStatus("tenant-1", "04a2b3c4d5e6f7", {
        cardRepo,
        userRepo,
      });

      expect(result.blocked).toBe(true);
      expect(result.notInLocalDb).toBe(false);
    });

    it("includes 'ditangguhkan' in the reason when user is suspended", async () => {
      vi.mocked(cardRepo.getByTenantAndCardId).mockResolvedValue(makeCard({ userId: "user-abc" }));
      vi.mocked(userRepo.getByTenantAndUserId).mockResolvedValue(makeUser({ status: "suspended" }));

      const result = await checkLocalBlockedStatus("tenant-1", "04a2b3c4d5e6f7", {
        cardRepo,
        userRepo,
      });

      expect(result.reason).toContain("ditangguhkan");
    });

    it("returns blocked=false when user record is not found in DB", async () => {
      vi.mocked(cardRepo.getByTenantAndCardId).mockResolvedValue(makeCard({ userId: "user-abc" }));
      vi.mocked(userRepo.getByTenantAndUserId).mockResolvedValue(undefined);

      const result = await checkLocalBlockedStatus("tenant-1", "04a2b3c4d5e6f7", {
        cardRepo,
        userRepo,
      });

      expect(result.blocked).toBe(false);
    });
  });

  // -------------------------------------------------------------------------
  // Serial number normalization
  // -------------------------------------------------------------------------

  describe("serial number normalization", () => {
    it("strips colons from serial number before DB lookup", async () => {
      vi.mocked(cardRepo.getByTenantAndCardId).mockResolvedValue(undefined);

      await checkLocalBlockedStatus("tenant-1", "04:A2:B3:C4:D5:E6:F7", { cardRepo, userRepo });

      expect(cardRepo.getByTenantAndCardId).toHaveBeenCalledWith("tenant-1", "04a2b3c4d5e6f7");
    });

    it("strips dashes from serial number before DB lookup", async () => {
      vi.mocked(cardRepo.getByTenantAndCardId).mockResolvedValue(undefined);

      await checkLocalBlockedStatus("tenant-1", "04-A2-B3-C4-D5-E6-F7", { cardRepo, userRepo });

      expect(cardRepo.getByTenantAndCardId).toHaveBeenCalledWith("tenant-1", "04a2b3c4d5e6f7");
    });

    it("converts serial number to lowercase before DB lookup", async () => {
      vi.mocked(cardRepo.getByTenantAndCardId).mockResolvedValue(undefined);

      await checkLocalBlockedStatus("tenant-1", "04A2B3C4D5E6F7", { cardRepo, userRepo });

      expect(cardRepo.getByTenantAndCardId).toHaveBeenCalledWith("tenant-1", "04a2b3c4d5e6f7");
    });

    it("handles already-normalized serial number", async () => {
      vi.mocked(cardRepo.getByTenantAndCardId).mockResolvedValue(undefined);

      await checkLocalBlockedStatus("tenant-1", "04a2b3c4d5e6f7", { cardRepo, userRepo });

      expect(cardRepo.getByTenantAndCardId).toHaveBeenCalledWith("tenant-1", "04a2b3c4d5e6f7");
    });

    it("passes tenantId through unchanged", async () => {
      vi.mocked(cardRepo.getByTenantAndCardId).mockResolvedValue(undefined);

      await checkLocalBlockedStatus("MY-TENANT-ID", "04a2b3c4d5e6f7", { cardRepo, userRepo });

      expect(cardRepo.getByTenantAndCardId).toHaveBeenCalledWith("MY-TENANT-ID", "04a2b3c4d5e6f7");
    });
  });
});
