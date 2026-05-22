import { describe, it, expect, vi } from "vitest";
import {
  validateSlug,
  validateName,
  validateTimezone,
  validateAdminUsername,
  validateAdminPasswordHash,
  validateSyncRequest,
} from "../tenantSync";

// Mock the database module (needed for processTenantSync but not for validators)
vi.mock("#/db", () => ({
  getDb: vi.fn(() => ({
    select: vi.fn(() => ({
      from: vi.fn(() => ({
        where: vi.fn(() => ({
          get: vi.fn().mockResolvedValue(undefined),
        })),
      })),
    })),
    batch: vi.fn().mockResolvedValue([]),
    insert: vi.fn(() => ({
      values: vi.fn(),
    })),
  })),
}));

describe("tenantSync validators", () => {
  describe("validateSlug", () => {
    it("returns error for non-string slug", () => {
      const errors = validateSlug(undefined);
      expect(errors.length).toBeGreaterThan(0);
      expect(errors[0].field).toBe("slug");
    });

    it("returns error for too short slug", () => {
      const errors = validateSlug("ab");
      expect(errors.some((e) => e.message.includes("between"))).toBe(true);
    });

    it("returns error for too long slug", () => {
      const errors = validateSlug("a".repeat(51));
      expect(errors.some((e) => e.message.includes("between"))).toBe(true);
    });

    it("returns error for slug with uppercase", () => {
      const errors = validateSlug("Hello");
      expect(errors.length).toBeGreaterThan(0);
    });

    it("returns error for slug with special chars", () => {
      const errors = validateSlug("foo_bar");
      expect(errors.some((e) => e.message.includes("lowercase"))).toBe(true);
    });

    it("returns error for consecutive hyphens", () => {
      const errors = validateSlug("foo--bar");
      expect(errors.some((e) => e.message.includes("consecutive"))).toBe(true);
    });

    it("returns error for slug starting with hyphen", () => {
      const errors = validateSlug("-foo");
      expect(errors.length).toBeGreaterThan(0);
    });

    it("returns error for slug ending with hyphen", () => {
      const errors = validateSlug("foo-");
      expect(errors.length).toBeGreaterThan(0);
    });

    it("returns empty array for valid slug", () => {
      expect(validateSlug("my-valid-slug")).toEqual([]);
    });

    it("returns empty array for minimum length slug", () => {
      expect(validateSlug("abc")).toEqual([]);
    });

    it("returns empty array for slug with digits", () => {
      expect(validateSlug("test-123")).toEqual([]);
    });
  });

  describe("validateName", () => {
    it("returns error for non-string name", () => {
      const errors = validateName(123);
      expect(errors[0].field).toBe("name");
    });

    it("returns error for too short name", () => {
      const errors = validateName("A");
      expect(errors.some((e) => e.message.includes("between"))).toBe(true);
    });

    it("returns error for too long name", () => {
      const errors = validateName("a".repeat(101));
      expect(errors.some((e) => e.message.includes("between"))).toBe(true);
    });

    it("returns error for whitespace-only name", () => {
      const errors = validateName("   ");
      expect(errors.some((e) => e.message.includes("non-whitespace"))).toBe(true);
    });

    it("returns empty array for valid name", () => {
      expect(validateName("My Tenant")).toEqual([]);
    });

    it("accepts minimum length name", () => {
      expect(validateName("AB")).toEqual([]);
    });
  });

  describe("validateTimezone", () => {
    it("returns error for non-string timezone", () => {
      const errors = validateTimezone(null);
      expect(errors[0].field).toBe("timezone");
    });

    it("returns error for empty string", () => {
      const errors = validateTimezone("");
      expect(errors.some((e) => e.message.includes("required"))).toBe(true);
    });

    it("returns error for invalid timezone", () => {
      const errors = validateTimezone("Invalid/Timezone");
      expect(errors.some((e) => e.message.includes("IANA"))).toBe(true);
    });

    it("returns empty array for valid timezone", () => {
      expect(validateTimezone("Asia/Jakarta")).toEqual([]);
    });

    it("accepts UTC", () => {
      expect(validateTimezone("UTC")).toEqual([]);
    });

    it("accepts America/New_York", () => {
      expect(validateTimezone("America/New_York")).toEqual([]);
    });
  });

  describe("validateAdminUsername", () => {
    it("returns error for non-string", () => {
      const errors = validateAdminUsername(undefined);
      expect(errors[0].field).toBe("adminUsername");
    });

    it("returns error for too short username", () => {
      const errors = validateAdminUsername("ab");
      expect(errors.some((e) => e.message.includes("between"))).toBe(true);
    });

    it("returns error for too long username", () => {
      const errors = validateAdminUsername("a".repeat(51));
      expect(errors.some((e) => e.message.includes("between"))).toBe(true);
    });

    it("returns error for username with spaces", () => {
      const errors = validateAdminUsername("admin user");
      expect(errors.some((e) => e.message.includes("spaces"))).toBe(true);
    });

    it("returns error for username with uppercase", () => {
      const errors = validateAdminUsername("Admin");
      expect(errors.some((e) => e.message.includes("lowercase"))).toBe(true);
    });

    it("returns empty array for valid username", () => {
      expect(validateAdminUsername("admin_user")).toEqual([]);
    });

    it("accepts hyphens", () => {
      expect(validateAdminUsername("admin-user")).toEqual([]);
    });

    it("accepts digits", () => {
      expect(validateAdminUsername("admin123")).toEqual([]);
    });
  });

  describe("validateAdminPasswordHash", () => {
    it("returns error for non-string", () => {
      const errors = validateAdminPasswordHash(null);
      expect(errors[0].field).toBe("adminPasswordHash");
    });

    it("returns error for wrong format (not 3 parts)", () => {
      const errors = validateAdminPasswordHash("onlyonepart");
      expect(errors.some((e) => e.message.includes("format"))).toBe(true);
    });

    it("returns error for non-integer iterations", () => {
      const salt = "a".repeat(32);
      const hash = "b".repeat(64);
      const errors = validateAdminPasswordHash(`abc:${salt}:${hash}`);
      expect(errors.some((e) => e.message.includes("iterations"))).toBe(true);
    });

    it("returns error for zero iterations", () => {
      const salt = "a".repeat(32);
      const hash = "b".repeat(64);
      const errors = validateAdminPasswordHash(`0:${salt}:${hash}`);
      expect(errors.some((e) => e.message.includes("positive"))).toBe(true);
    });

    it("returns error for invalid salt length", () => {
      const hash = "b".repeat(64);
      const errors = validateAdminPasswordHash(`100000:short:${hash}`);
      expect(errors.some((e) => e.message.includes("saltHex"))).toBe(true);
    });

    it("returns error for invalid hash length", () => {
      const salt = "a".repeat(32);
      const errors = validateAdminPasswordHash(`100000:${salt}:short`);
      expect(errors.some((e) => e.message.includes("hashHex"))).toBe(true);
    });

    it("returns empty array for valid hash", () => {
      const salt = "a".repeat(32);
      const hash = "b".repeat(64);
      expect(validateAdminPasswordHash(`100000:${salt}:${hash}`)).toEqual([]);
    });
  });

  describe("validateSyncRequest", () => {
    it("returns error for null body", () => {
      const errors = validateSyncRequest(null);
      expect(errors[0].field).toBe("body");
    });

    it("returns error for undefined body", () => {
      const errors = validateSyncRequest(undefined);
      expect(errors[0].field).toBe("body");
    });

    it("returns error for non-object body", () => {
      const errors = validateSyncRequest("string");
      expect(errors[0].field).toBe("body");
    });

    it("returns all field errors for empty object", () => {
      const errors = validateSyncRequest({});
      const fields = errors.map((e) => e.field);
      expect(fields).toContain("slug");
      expect(fields).toContain("name");
      expect(fields).toContain("timezone");
      expect(fields).toContain("adminUsername");
      expect(fields).toContain("adminPasswordHash");
    });

    it("returns empty array for valid request", () => {
      const salt = "a".repeat(32);
      const hash = "b".repeat(64);
      const errors = validateSyncRequest({
        slug: "my-tenant",
        name: "My Tenant",
        timezone: "Asia/Jakarta",
        adminUsername: "admin_user",
        adminPasswordHash: `100000:${salt}:${hash}`,
      });
      expect(errors).toEqual([]);
    });
  });
});
