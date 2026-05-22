import { describe, it, expect } from "vitest";
import { VALID_TRANSITIONS, isValidTransition } from "#/application/admin/superadminTenants.types";

describe("superadminTenants.types", () => {
  describe("VALID_TRANSITIONS", () => {
    it("active can transition to suspended", () => {
      expect(VALID_TRANSITIONS.active.has("suspended")).toBe(true);
    });

    it("active can transition to archived", () => {
      expect(VALID_TRANSITIONS.active.has("archived")).toBe(true);
    });

    it("suspended can transition to active", () => {
      expect(VALID_TRANSITIONS.suspended.has("active")).toBe(true);
    });

    it("suspended can transition to archived", () => {
      expect(VALID_TRANSITIONS.suspended.has("archived")).toBe(true);
    });

    it("archived has no valid transitions (terminal state)", () => {
      expect(VALID_TRANSITIONS.archived.size).toBe(0);
    });
  });

  describe("isValidTransition", () => {
    it("returns true for active → suspended", () => {
      expect(isValidTransition("active", "suspended")).toBe(true);
    });

    it("returns true for active → archived", () => {
      expect(isValidTransition("active", "archived")).toBe(true);
    });

    it("returns true for suspended → active", () => {
      expect(isValidTransition("suspended", "active")).toBe(true);
    });

    it("returns true for suspended → archived", () => {
      expect(isValidTransition("suspended", "archived")).toBe(true);
    });

    it("returns false for archived → active", () => {
      expect(isValidTransition("archived", "active")).toBe(false);
    });

    it("returns false for archived → suspended", () => {
      expect(isValidTransition("archived", "suspended")).toBe(false);
    });

    it("returns false for active → active (same state)", () => {
      expect(isValidTransition("active", "active")).toBe(false);
    });

    it("returns false for suspended → suspended (same state)", () => {
      expect(isValidTransition("suspended", "suspended")).toBe(false);
    });

    it("returns false for archived → archived (same state)", () => {
      expect(isValidTransition("archived", "archived")).toBe(false);
    });
  });
});
