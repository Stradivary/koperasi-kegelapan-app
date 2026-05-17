/**
 * Unit tests for tenant sync request validation
 *
 * Tests the validation logic for SyncRequest fields.
 *
 * @see Requirements 5.1, 5.2, 5.3, 5.4, 5.5, 5.6, 5.7
 */

import { describe, it, expect } from "vitest";
import {
  validateSlug,
  validateName,
  validateTimezone,
  validateAdminUsername,
  validateAdminPasswordHash,
  validateSyncRequest,
} from "./tenantSync";

describe("validateSlug", () => {
  it("accepts valid slugs", () => {
    expect(validateSlug("abc")).toEqual([]);
    expect(validateSlug("my-tenant")).toEqual([]);
    expect(validateSlug("koperasi-123")).toEqual([]);
    expect(validateSlug("a1b")).toEqual([]);
    expect(validateSlug("a".repeat(50))).toEqual([]);
  });

  it("rejects slugs shorter than 3 characters", () => {
    const errors = validateSlug("ab");
    expect(errors.some((e) => e.field === "slug" && e.message.includes("3 and 50"))).toBe(true);
  });

  it("rejects slugs longer than 50 characters", () => {
    const errors = validateSlug("a".repeat(51));
    expect(errors.some((e) => e.field === "slug" && e.message.includes("3 and 50"))).toBe(true);
  });

  it("rejects slugs with uppercase letters", () => {
    const errors = validateSlug("My-Tenant");
    expect(errors.some((e) => e.field === "slug")).toBe(true);
  });

  it("rejects slugs starting with a hyphen", () => {
    const errors = validateSlug("-abc");
    expect(errors.some((e) => e.field === "slug" && e.message.includes("start and end"))).toBe(
      true,
    );
  });

  it("rejects slugs ending with a hyphen", () => {
    const errors = validateSlug("abc-");
    expect(errors.some((e) => e.field === "slug" && e.message.includes("start and end"))).toBe(
      true,
    );
  });

  it("rejects slugs with consecutive hyphens", () => {
    const errors = validateSlug("my--tenant");
    expect(errors.some((e) => e.field === "slug" && e.message.includes("consecutive"))).toBe(true);
  });

  it("rejects slugs with special characters", () => {
    const errors = validateSlug("my_tenant");
    expect(errors.some((e) => e.field === "slug")).toBe(true);
  });

  it("rejects non-string values", () => {
    const errors = validateSlug(undefined);
    expect(errors.some((e) => e.field === "slug" && e.message.includes("required"))).toBe(true);
  });
});

describe("validateName", () => {
  it("accepts valid names", () => {
    expect(validateName("AB")).toEqual([]);
    expect(validateName("Koperasi Kegelapan")).toEqual([]);
    expect(validateName("a".repeat(100))).toEqual([]);
  });

  it("rejects names shorter than 2 characters", () => {
    const errors = validateName("A");
    expect(errors.some((e) => e.field === "name" && e.message.includes("2 and 100"))).toBe(true);
  });

  it("rejects names longer than 100 characters", () => {
    const errors = validateName("a".repeat(101));
    expect(errors.some((e) => e.field === "name" && e.message.includes("2 and 100"))).toBe(true);
  });

  it("rejects names with only whitespace", () => {
    const errors = validateName("   ");
    expect(errors.some((e) => e.field === "name" && e.message.includes("non-whitespace"))).toBe(
      true,
    );
  });

  it("rejects non-string values", () => {
    const errors = validateName(null);
    expect(errors.some((e) => e.field === "name" && e.message.includes("required"))).toBe(true);
  });
});

describe("validateTimezone", () => {
  it("accepts valid IANA timezones", () => {
    expect(validateTimezone("Asia/Jakarta")).toEqual([]);
    expect(validateTimezone("America/New_York")).toEqual([]);
    expect(validateTimezone("UTC")).toEqual([]);
    expect(validateTimezone("Europe/London")).toEqual([]);
  });

  it("rejects invalid timezone strings", () => {
    const errors = validateTimezone("Invalid/Timezone");
    expect(errors.some((e) => e.field === "timezone" && e.message.includes("valid IANA"))).toBe(
      true,
    );
  });

  it("rejects empty string", () => {
    const errors = validateTimezone("");
    expect(errors.some((e) => e.field === "timezone")).toBe(true);
  });

  it("rejects non-string values", () => {
    const errors = validateTimezone(123);
    expect(errors.some((e) => e.field === "timezone" && e.message.includes("required"))).toBe(true);
  });
});

describe("validateAdminUsername", () => {
  it("accepts valid usernames", () => {
    expect(validateAdminUsername("abc")).toEqual([]);
    expect(validateAdminUsername("admin_user")).toEqual([]);
    expect(validateAdminUsername("user-name")).toEqual([]);
    expect(validateAdminUsername("user123")).toEqual([]);
    expect(validateAdminUsername("a".repeat(50))).toEqual([]);
  });

  it("rejects usernames shorter than 3 characters", () => {
    const errors = validateAdminUsername("ab");
    expect(errors.some((e) => e.field === "adminUsername" && e.message.includes("3 and 50"))).toBe(
      true,
    );
  });

  it("rejects usernames longer than 50 characters", () => {
    const errors = validateAdminUsername("a".repeat(51));
    expect(errors.some((e) => e.field === "adminUsername" && e.message.includes("3 and 50"))).toBe(
      true,
    );
  });

  it("rejects usernames with spaces", () => {
    const errors = validateAdminUsername("admin user");
    expect(errors.some((e) => e.field === "adminUsername" && e.message.includes("spaces"))).toBe(
      true,
    );
  });

  it("rejects usernames with uppercase letters", () => {
    const errors = validateAdminUsername("Admin");
    expect(errors.some((e) => e.field === "adminUsername")).toBe(true);
  });

  it("rejects non-string values", () => {
    const errors = validateAdminUsername(undefined);
    expect(errors.some((e) => e.field === "adminUsername" && e.message.includes("required"))).toBe(
      true,
    );
  });
});

describe("validateAdminPasswordHash", () => {
  const validHash = `310000:${"a".repeat(32)}:${"b".repeat(64)}`;

  it("accepts valid password hash format", () => {
    expect(validateAdminPasswordHash(validHash)).toEqual([]);
    expect(validateAdminPasswordHash(`1:${"0".repeat(32)}:${"f".repeat(64)}`)).toEqual([]);
  });

  it("rejects wrong number of parts", () => {
    const errors = validateAdminPasswordHash("only-two:parts");
    expect(
      errors.some((e) => e.field === "adminPasswordHash" && e.message.includes("format")),
    ).toBe(true);
  });

  it("rejects non-integer iterations", () => {
    const errors = validateAdminPasswordHash(`abc:${"a".repeat(32)}:${"b".repeat(64)}`);
    expect(
      errors.some((e) => e.field === "adminPasswordHash" && e.message.includes("positive integer")),
    ).toBe(true);
  });

  it("rejects zero iterations", () => {
    const errors = validateAdminPasswordHash(`0:${"a".repeat(32)}:${"b".repeat(64)}`);
    expect(
      errors.some((e) => e.field === "adminPasswordHash" && e.message.includes("positive integer")),
    ).toBe(true);
  });

  it("rejects negative iterations", () => {
    const errors = validateAdminPasswordHash(`-1:${"a".repeat(32)}:${"b".repeat(64)}`);
    expect(
      errors.some((e) => e.field === "adminPasswordHash" && e.message.includes("positive integer")),
    ).toBe(true);
  });

  it("rejects salt with wrong length", () => {
    const errors = validateAdminPasswordHash(`310000:${"a".repeat(16)}:${"b".repeat(64)}`);
    expect(
      errors.some((e) => e.field === "adminPasswordHash" && e.message.includes("saltHex")),
    ).toBe(true);
  });

  it("rejects hash with wrong length", () => {
    const errors = validateAdminPasswordHash(`310000:${"a".repeat(32)}:${"b".repeat(32)}`);
    expect(
      errors.some((e) => e.field === "adminPasswordHash" && e.message.includes("hashHex")),
    ).toBe(true);
  });

  it("rejects non-hex characters in salt", () => {
    const errors = validateAdminPasswordHash(`310000:${"g".repeat(32)}:${"b".repeat(64)}`);
    expect(
      errors.some((e) => e.field === "adminPasswordHash" && e.message.includes("saltHex")),
    ).toBe(true);
  });

  it("rejects non-string values", () => {
    const errors = validateAdminPasswordHash(null);
    expect(
      errors.some((e) => e.field === "adminPasswordHash" && e.message.includes("required")),
    ).toBe(true);
  });
});

describe("validateSyncRequest", () => {
  const validRequest = {
    slug: "my-tenant",
    name: "My Tenant",
    timezone: "Asia/Jakarta",
    adminUsername: "admin_user",
    adminPasswordHash: `310000:${"a".repeat(32)}:${"b".repeat(64)}`,
  };

  it("returns empty array for valid request", () => {
    expect(validateSyncRequest(validRequest)).toEqual([]);
  });

  it("returns errors for all invalid fields", () => {
    const errors = validateSyncRequest({
      slug: "A",
      name: "",
      timezone: "Invalid/TZ",
      adminUsername: "A B",
      adminPasswordHash: "bad",
    });
    expect(errors.length).toBeGreaterThan(0);
    const fields = errors.map((e) => e.field);
    expect(fields).toContain("slug");
    expect(fields).toContain("name");
    expect(fields).toContain("timezone");
    expect(fields).toContain("adminUsername");
    expect(fields).toContain("adminPasswordHash");
  });

  it("returns errors for missing fields", () => {
    const errors = validateSyncRequest({});
    expect(errors.length).toBeGreaterThan(0);
    const fields = errors.map((e) => e.field);
    expect(fields).toContain("slug");
    expect(fields).toContain("name");
    expect(fields).toContain("timezone");
    expect(fields).toContain("adminUsername");
    expect(fields).toContain("adminPasswordHash");
  });

  it("returns error for null body", () => {
    const errors = validateSyncRequest(null);
    expect(errors).toEqual([
      { field: "body", message: "request body is required and must be an object" },
    ]);
  });

  it("returns error for undefined body", () => {
    const errors = validateSyncRequest(undefined);
    expect(errors).toEqual([
      { field: "body", message: "request body is required and must be an object" },
    ]);
  });
});
