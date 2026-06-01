/**
 * Unit tests for PrintButtonValidator
 *
 * Tests the evaluatePrintEligibilitySync function which contains the core
 * validation logic, and the async evaluatePrintEligibility function.
 *
 * @see Requirements 1.1, 1.2, 1.3, 1.4, 1.5, 1.6
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { evaluatePrintEligibilitySync, evaluatePrintEligibility } from "../printButtonValidator";
import type { CardRecord } from "#/core/interfaces/types";
import type { CardRepository } from "#/core/interfaces/CardRepository";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeCard(overrides: Partial<CardRecord> = {}): CardRecord {
  return {
    tenantId: "tenant-1",
    cardId: "aabbccdd",
    userId: null,
    status: "active",
    balance: 0,
    counter: 0,
    keyVersion: 1,
    createdAt: 1700000000,
    lastActivityAt: null,
    expiresAt: null,
    notes: null,
    ...overrides,
  };
}

function createMockCardRepo(card?: CardRecord | undefined): CardRepository {
  return {
    getByTenantAndCardId: vi.fn().mockResolvedValue(card),
    filterByCardIdExcludingDeleted: vi.fn().mockResolvedValue([]),
    updateStatus: vi.fn().mockResolvedValue(undefined),
    put: vi.fn().mockResolvedValue(undefined),
  };
}

// ---------------------------------------------------------------------------
// evaluatePrintEligibilitySync
// ---------------------------------------------------------------------------

describe("evaluatePrintEligibilitySync", () => {
  describe("Requirement 1.1: Card not found", () => {
    it("returns CARD_NOT_FOUND when card is undefined", () => {
      const result = evaluatePrintEligibilitySync(undefined, { withMember: true });
      expect(result).toEqual({ enabled: false, reason: "CARD_NOT_FOUND" });
    });

    it("returns CARD_NOT_FOUND when card is undefined regardless of withMember", () => {
      const result = evaluatePrintEligibilitySync(undefined, { withMember: false });
      expect(result).toEqual({ enabled: false, reason: "CARD_NOT_FOUND" });
    });
  });

  describe("Requirement 1.2: Blocked card takes precedence", () => {
    it("returns CARD_BLOCKED for blocked_admin status", () => {
      const card = makeCard({ status: "blocked_admin" });
      const result = evaluatePrintEligibilitySync(card, { withMember: true });
      expect(result).toEqual({ enabled: false, reason: "CARD_BLOCKED" });
    });

    it("returns CARD_BLOCKED for blocked_tamper status", () => {
      const card = makeCard({ status: "blocked_tamper" });
      const result = evaluatePrintEligibilitySync(card, { withMember: false });
      expect(result).toEqual({ enabled: false, reason: "CARD_BLOCKED" });
    });

    it("returns CARD_BLOCKED for blocked_fraud status", () => {
      const card = makeCard({ status: "blocked_fraud", balance: 1000 });
      const result = evaluatePrintEligibilitySync(card, { withMember: true });
      expect(result).toEqual({ enabled: false, reason: "CARD_BLOCKED" });
    });

    it("returns CARD_BLOCKED for blocked_expired status", () => {
      const card = makeCard({ status: "blocked_expired", balance: 500 });
      const result = evaluatePrintEligibilitySync(card, { withMember: false });
      expect(result).toEqual({ enabled: false, reason: "CARD_BLOCKED" });
    });

    it("CARD_BLOCKED takes precedence over NO_MEMBER_NO_BALANCE", () => {
      const card = makeCard({ status: "blocked_admin", balance: 0 });
      const result = evaluatePrintEligibilitySync(card, { withMember: false });
      expect(result).toEqual({ enabled: false, reason: "CARD_BLOCKED" });
    });
  });

  describe("Requirement 1.3: No member + zero balance", () => {
    it("returns NO_MEMBER_NO_BALANCE when withMember is false and balance is 0", () => {
      const card = makeCard({ status: "active", balance: 0 });
      const result = evaluatePrintEligibilitySync(card, { withMember: false });
      expect(result).toEqual({ enabled: false, reason: "NO_MEMBER_NO_BALANCE" });
    });
  });

  describe("Requirement 1.4: Enabled cases", () => {
    it("returns enabled when withMember is true and balance is 0", () => {
      const card = makeCard({ status: "active", balance: 0 });
      const result = evaluatePrintEligibilitySync(card, { withMember: true });
      expect(result).toEqual({ enabled: true });
    });

    it("returns enabled when withMember is false and balance > 0", () => {
      const card = makeCard({ status: "active", balance: 1000 });
      const result = evaluatePrintEligibilitySync(card, { withMember: false });
      expect(result).toEqual({ enabled: true });
    });

    it("returns enabled when withMember is true and balance > 0", () => {
      const card = makeCard({ status: "active", balance: 5000 });
      const result = evaluatePrintEligibilitySync(card, { withMember: true });
      expect(result).toEqual({ enabled: true });
    });
  });

  describe("Requirement 1.5: Synchronous re-evaluation on withMember change", () => {
    it("changes result synchronously when withMember toggles (zero balance)", () => {
      const card = makeCard({ status: "active", balance: 0 });

      const result1 = evaluatePrintEligibilitySync(card, { withMember: true });
      expect(result1).toEqual({ enabled: true });

      const result2 = evaluatePrintEligibilitySync(card, { withMember: false });
      expect(result2).toEqual({ enabled: false, reason: "NO_MEMBER_NO_BALANCE" });
    });

    it("remains enabled regardless of withMember when balance > 0", () => {
      const card = makeCard({ status: "active", balance: 100 });

      const result1 = evaluatePrintEligibilitySync(card, { withMember: true });
      expect(result1).toEqual({ enabled: true });

      const result2 = evaluatePrintEligibilitySync(card, { withMember: false });
      expect(result2).toEqual({ enabled: true });
    });
  });
});

// ---------------------------------------------------------------------------
// evaluatePrintEligibility - async wrapper (Requirement 1.6)
// ---------------------------------------------------------------------------

describe("evaluatePrintEligibility (async)", () => {
  let mockCardRepo: CardRepository;

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns CARD_NOT_FOUND when card is not in IndexedDB", async () => {
    mockCardRepo = createMockCardRepo(undefined);

    const result = await evaluatePrintEligibility("aabbccdd", { withMember: true }, "tenant-1", {
      cardRepo: mockCardRepo,
    });

    expect(result).toEqual({ enabled: false, reason: "CARD_NOT_FOUND" });
  });

  it("returns CARD_NOT_FOUND when IndexedDB throws (Requirement 1.6)", async () => {
    mockCardRepo = createMockCardRepo();
    vi.mocked(mockCardRepo.getByTenantAndCardId).mockRejectedValue(
      new Error("IndexedDB quota exceeded"),
    );

    const result = await evaluatePrintEligibility("aabbccdd", { withMember: true }, "tenant-1", {
      cardRepo: mockCardRepo,
    });

    expect(result).toEqual({ enabled: false, reason: "CARD_NOT_FOUND" });
  });

  it("returns CARD_BLOCKED when card is blocked", async () => {
    mockCardRepo = createMockCardRepo(makeCard({ status: "blocked_admin" }));

    const result = await evaluatePrintEligibility("aabbccdd", { withMember: true }, "tenant-1", {
      cardRepo: mockCardRepo,
    });

    expect(result).toEqual({ enabled: false, reason: "CARD_BLOCKED" });
  });

  it("returns NO_MEMBER_NO_BALANCE when active, no member, zero balance", async () => {
    mockCardRepo = createMockCardRepo(makeCard({ status: "active", balance: 0 }));

    const result = await evaluatePrintEligibility("aabbccdd", { withMember: false }, "tenant-1", {
      cardRepo: mockCardRepo,
    });

    expect(result).toEqual({ enabled: false, reason: "NO_MEMBER_NO_BALANCE" });
  });

  it("returns enabled when active, withMember=true, zero balance", async () => {
    mockCardRepo = createMockCardRepo(makeCard({ status: "active", balance: 0 }));

    const result = await evaluatePrintEligibility("aabbccdd", { withMember: true }, "tenant-1", {
      cardRepo: mockCardRepo,
    });

    expect(result).toEqual({ enabled: true });
  });

  it("queries CardRepository with correct tenantId and cardId", async () => {
    mockCardRepo = createMockCardRepo(undefined);

    await evaluatePrintEligibility("aabbccdd", { withMember: false }, "tenant-xyz", {
      cardRepo: mockCardRepo,
    });

    expect(mockCardRepo.getByTenantAndCardId).toHaveBeenCalledWith("tenant-xyz", "aabbccdd");
  });
});
