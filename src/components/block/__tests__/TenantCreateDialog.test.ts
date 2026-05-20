import { describe, it, expect } from "vitest";

import {
  validateSlug,
  validateName,
  validateTimezone,
  validateAdminUsername,
  validateAdminPassword,
  generateSlugFromName,
} from "../TenantCreateDialog";

describe("TenantCreateDialog - generateSlugFromName", () => {
  it("should convert name to lowercase", () => {
    expect(generateSlugFromName("My Koperasi")).toBe("my-koperasi");
  });

  it("should replace spaces with hyphens", () => {
    expect(generateSlugFromName("hello world")).toBe("hello-world");
  });

  it("should replace non-alphanumeric characters with hyphens", () => {
    expect(generateSlugFromName("hello@world!")).toBe("hello-world");
  });

  it("should collapse consecutive hyphens", () => {
    expect(generateSlugFromName("hello   world")).toBe("hello-world");
    expect(generateSlugFromName("a---b")).toBe("a-b");
  });

  it("should trim leading and trailing hyphens", () => {
    expect(generateSlugFromName("  hello  ")).toBe("hello");
    expect(generateSlugFromName("@hello@")).toBe("hello");
  });

  it("should handle mixed special characters", () => {
    expect(generateSlugFromName("Koperasi Desa #1 (Baru)")).toBe("koperasi-desa-1-baru");
  });

  it("should handle empty string", () => {
    expect(generateSlugFromName("")).toBe("");
  });
});

describe("TenantCreateDialog - validateSlug", () => {
  it("should accept valid slugs", () => {
    expect(validateSlug("my-koperasi")).toBeNull();
    expect(validateSlug("abc")).toBeNull();
    expect(validateSlug("a1b")).toBeNull();
    expect(validateSlug("test-tenant-123")).toBeNull();
  });

  it("should reject slugs shorter than 3 characters", () => {
    expect(validateSlug("ab")).not.toBeNull();
    expect(validateSlug("a")).not.toBeNull();
  });

  it("should reject slugs longer than 50 characters", () => {
    const longSlug = "a".repeat(51);
    expect(validateSlug(longSlug)).not.toBeNull();
  });

  it("should reject slugs with uppercase letters", () => {
    expect(validateSlug("My-Koperasi")).not.toBeNull();
  });

  it("should reject slugs with consecutive hyphens", () => {
    expect(validateSlug("my--koperasi")).not.toBeNull();
  });

  it("should reject slugs starting with a hyphen", () => {
    expect(validateSlug("-my-koperasi")).not.toBeNull();
  });

  it("should reject slugs ending with a hyphen", () => {
    expect(validateSlug("my-koperasi-")).not.toBeNull();
  });

  it("should reject slugs with special characters", () => {
    expect(validateSlug("my_koperasi")).not.toBeNull();
    expect(validateSlug("my.koperasi")).not.toBeNull();
  });
});

describe("TenantCreateDialog - validateName", () => {
  it("should accept valid names", () => {
    expect(validateName("My Koperasi")).toBeNull();
    expect(validateName("AB")).toBeNull();
  });

  it("should reject names shorter than 2 characters", () => {
    expect(validateName("A")).not.toBeNull();
  });

  it("should reject names longer than 100 characters", () => {
    expect(validateName("A".repeat(101))).not.toBeNull();
  });

  it("should reject names with only whitespace", () => {
    expect(validateName("   ")).not.toBeNull();
  });
});

describe("TenantCreateDialog - validateTimezone", () => {
  it("should accept valid IANA timezones", () => {
    expect(validateTimezone("Asia/Jakarta")).toBeNull();
    expect(validateTimezone("UTC")).toBeNull();
    expect(validateTimezone("America/New_York")).toBeNull();
  });

  it("should reject empty timezone", () => {
    expect(validateTimezone("")).not.toBeNull();
  });

  it("should reject invalid timezone strings", () => {
    expect(validateTimezone("Invalid/Timezone")).not.toBeNull();
    expect(validateTimezone("not-a-timezone")).not.toBeNull();
  });
});

describe("TenantCreateDialog - validateAdminUsername", () => {
  it("should accept valid usernames", () => {
    expect(validateAdminUsername("admin")).toBeNull();
    expect(validateAdminUsername("admin-user")).toBeNull();
    expect(validateAdminUsername("admin_user")).toBeNull();
    expect(validateAdminUsername("admin123")).toBeNull();
  });

  it("should reject usernames shorter than 3 characters", () => {
    expect(validateAdminUsername("ab")).not.toBeNull();
  });

  it("should reject usernames longer than 50 characters", () => {
    expect(validateAdminUsername("a".repeat(51))).not.toBeNull();
  });

  it("should reject usernames with spaces", () => {
    expect(validateAdminUsername("admin user")).not.toBeNull();
  });

  it("should reject usernames with uppercase letters", () => {
    expect(validateAdminUsername("Admin")).not.toBeNull();
  });

  it("should reject usernames with special characters", () => {
    expect(validateAdminUsername("admin@user")).not.toBeNull();
    expect(validateAdminUsername("admin.user")).not.toBeNull();
  });
});

describe("TenantCreateDialog - validateAdminPassword", () => {
  it("should accept valid passwords", () => {
    expect(validateAdminPassword("password123")).toBeNull();
    expect(validateAdminPassword("12345678")).toBeNull();
  });

  it("should reject passwords shorter than 8 characters", () => {
    expect(validateAdminPassword("1234567")).not.toBeNull();
  });

  it("should reject passwords longer than 128 characters", () => {
    expect(validateAdminPassword("a".repeat(129))).not.toBeNull();
  });
});
