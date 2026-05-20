/**
 * Unit tests for PrintButtonValidator
 *
 * Tests the evaluatePrintEligibilitySync function which contains the core
 * validation logic, and the async evaluatePrintEligibility function.
 *
 * @see Requirements 1.1, 1.2, 1.3, 1.4, 1.5, 1.6
 */

import { describe, it, expect } from "vitest";
import { evaluatePrintEligibilitySync } from "../printButtonValidator";
import type { Card } from "../../../db/local-db";

/** Helper to create a card record for testing */
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
      // Card is blocked AND has no member AND zero balance
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

      // withMember = true → enabled
      const result1 = evaluatePrintEligibilitySync(card, { withMember: true });
      expect(result1).toEqual({ enabled: true });

      // withMember = false → disabled (same card, same render cycle)
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
