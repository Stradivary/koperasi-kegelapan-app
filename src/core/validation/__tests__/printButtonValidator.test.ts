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
import type { Card } from "#/db/local-db";

vi.mock("#/db/local-db", () => ({
  localDb: {
    cards: {
      get: vi.fn(),
    },
  },
}));

import { localDb } from "#/db/local-db";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeCard(overrides: Partial<Card> = {}): Card {
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
// evaluatePrintEligibility — async wrapper (Requirement 1.6)
// ---------------------------------------------------------------------------

describe("evaluatePrintEligibility (async)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns CARD_NOT_FOUND when card is not in IndexedDB", async () => {
    vi.mocked(localDb.cards.get).mockResolvedValue(undefined);

    const result = await evaluatePrintEligibility("aabbccdd", { withMember: true }, "tenant-1");

    expect(result).toEqual({ enabled: false, reason: "CARD_NOT_FOUND" });
  });

  it("returns CARD_NOT_FOUND when IndexedDB throws (Requirement 1.6)", async () => {
    vi.mocked(localDb.cards.get).mockRejectedValue(new Error("IndexedDB quota exceeded"));

    const result = await evaluatePrintEligibility("aabbccdd", { withMember: true }, "tenant-1");

    expect(result).toEqual({ enabled: false, reason: "CARD_NOT_FOUND" });
  });

  it("returns CARD_BLOCKED when card is blocked", async () => {
    vi.mocked(localDb.cards.get).mockResolvedValue(makeCard({ status: "blocked_admin" }));

    const result = await evaluatePrintEligibility("aabbccdd", { withMember: true }, "tenant-1");

    expect(result).toEqual({ enabled: false, reason: "CARD_BLOCKED" });
  });

  it("returns NO_MEMBER_NO_BALANCE when active, no member, zero balance", async () => {
    vi.mocked(localDb.cards.get).mockResolvedValue(makeCard({ status: "active", balance: 0 }));

    const result = await evaluatePrintEligibility("aabbccdd", { withMember: false }, "tenant-1");

    expect(result).toEqual({ enabled: false, reason: "NO_MEMBER_NO_BALANCE" });
  });

  it("returns enabled when active, withMember=true, zero balance", async () => {
    vi.mocked(localDb.cards.get).mockResolvedValue(makeCard({ status: "active", balance: 0 }));

    const result = await evaluatePrintEligibility("aabbccdd", { withMember: true }, "tenant-1");

    expect(result).toEqual({ enabled: true });
  });

  it("queries IndexedDB with correct [tenantId, cardId] key", async () => {
    vi.mocked(localDb.cards.get).mockResolvedValue(undefined);

    await evaluatePrintEligibility("aabbccdd", { withMember: false }, "tenant-xyz");

    expect(localDb.cards.get).toHaveBeenCalledWith(["tenant-xyz", "aabbccdd"]);
  });
});
