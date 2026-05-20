/**
 * Unit tests for PenaltyCalculator
 *
 * Tests the calculatePenalty function for:
 * - Zero penalty when not overtime or invalid rate
 * - Correct overtime hours calculation (rounded up)
 * - Correct penalty amount calculation
 * - Capping behavior with maxPenalty
 * - Non-negativity of results
 * - Pure function behavior (no side effects)
 *
 * @see Requirements 3.1, 3.2, 3.3, 3.4, 3.5, 3.6, 3.7
 */

import { describe, it, expect } from "vitest";
import { calculatePenalty } from "../penaltyCalculator";

describe("calculatePenalty", () => {
  describe("zero penalty cases (Requirement 3.6)", () => {
    it("should return zero when durationSeconds is exactly 86400", () => {
      const result = calculatePenalty(86400, 5000);

      expect(result.amount).toBe(0);
      expect(result.overtimeHours).toBe(0);
      expect(result.capped).toBe(false);
    });

    it("should return zero when durationSeconds is less than 86400", () => {
      const result = calculatePenalty(3600, 5000);

      expect(result.amount).toBe(0);
      expect(result.overtimeHours).toBe(0);
      expect(result.capped).toBe(false);
    });

    it("should return zero when durationSeconds is 0", () => {
      const result = calculatePenalty(0, 5000);

      expect(result.amount).toBe(0);
      expect(result.overtimeHours).toBe(0);
    });

    it("should return zero when tariffRatePerHour is 0", () => {
      const result = calculatePenalty(90000, 0);

      expect(result.amount).toBe(0);
      expect(result.overtimeHours).toBe(0);
    });

    it("should return zero when tariffRatePerHour is negative", () => {
      const result = calculatePenalty(90000, -1000);

      expect(result.amount).toBe(0);
      expect(result.overtimeHours).toBe(0);
    });
  });

  describe("overtime hours calculation (Requirement 3.1)", () => {
    it("should compute 1 overtime hour for 1 second over threshold", () => {
      // 86401 seconds → ceil((86401 - 86400) / 3600) = ceil(1/3600) = 1
      const result = calculatePenalty(86401, 5000);

      expect(result.overtimeHours).toBe(1);
    });

    it("should compute 1 overtime hour for exactly 1 hour over threshold", () => {
      // 90000 seconds → ceil((90000 - 86400) / 3600) = ceil(3600/3600) = 1
      const result = calculatePenalty(90000, 5000);

      expect(result.overtimeHours).toBe(1);
    });

    it("should round up partial hours", () => {
      // 90001 seconds → ceil((90001 - 86400) / 3600) = ceil(3601/3600) = 2
      const result = calculatePenalty(90001, 5000);

      expect(result.overtimeHours).toBe(2);
    });

    it("should compute correct hours for large durations", () => {
      // 172800 seconds (48h) → ceil((172800 - 86400) / 3600) = ceil(86400/3600) = 24
      const result = calculatePenalty(172800, 5000);

      expect(result.overtimeHours).toBe(24);
    });
  });

  describe("penalty amount calculation (Requirement 3.2)", () => {
    it("should compute amount as overtimeHours × tariffRatePerHour", () => {
      // 90000s → 1 hour overtime, rate 5000 → amount = 5000
      const result = calculatePenalty(90000, 5000);

      expect(result.amount).toBe(5000);
      expect(result.ratePerHour).toBe(5000);
    });

    it("should compute correct amount for multiple hours", () => {
      // 97200s (27h) → ceil((97200 - 86400) / 3600) = ceil(10800/3600) = 3 hours
      // amount = 3 × 10000 = 30000
      const result = calculatePenalty(97200, 10000);

      expect(result.overtimeHours).toBe(3);
      expect(result.amount).toBe(30000);
    });
  });

  describe("capping behavior (Requirements 3.3, 3.4)", () => {
    it("should cap amount when calculated exceeds maxPenalty", () => {
      // 3 hours × 10000 = 30000, maxPenalty = 20000
      const result = calculatePenalty(97200, 10000, 20000);

      expect(result.amount).toBe(20000);
      expect(result.capped).toBe(true);
    });

    it("should not cap when calculated is less than maxPenalty", () => {
      // 1 hour × 5000 = 5000, maxPenalty = 50000
      const result = calculatePenalty(90000, 5000, 50000);

      expect(result.amount).toBe(5000);
      expect(result.capped).toBe(false);
    });

    it("should not cap when calculated equals maxPenalty", () => {
      // 2 hours × 5000 = 10000, maxPenalty = 10000
      const result = calculatePenalty(93600, 5000, 10000);

      expect(result.amount).toBe(10000);
      expect(result.capped).toBe(false);
    });

    it("should not cap when maxPenalty is undefined", () => {
      // 24 hours × 10000 = 240000, no cap
      const result = calculatePenalty(172800, 10000);

      expect(result.amount).toBe(240000);
      expect(result.capped).toBe(false);
    });
  });

  describe("non-negativity (Requirement 3.5)", () => {
    it("should never return negative amount for valid overtime inputs", () => {
      const result = calculatePenalty(86401, 1);

      expect(result.amount).toBeGreaterThanOrEqual(0);
    });
  });

  describe("pure function (Requirement 3.7)", () => {
    it("should return the same result for the same inputs", () => {
      const result1 = calculatePenalty(90000, 5000, 50000);
      const result2 = calculatePenalty(90000, 5000, 50000);

      expect(result1).toEqual(result2);
    });

    it("should include ratePerHour in the result", () => {
      const result = calculatePenalty(90000, 7500);

      expect(result.ratePerHour).toBe(7500);
    });
  });
});
