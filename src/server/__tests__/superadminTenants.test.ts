/**
 * Unit tests for superadmin tenant management logic.
 *
 * Tests the createTenant validation logic (password validation, field validation).
 * Database-dependent tests are covered by property tests in task 2.5.
 *
 * @see Requirements 4.1, 4.2, 4.3, 4.4, 4.5, 4.9, 8.1, 8.2, 8.3, 8.4
 */

import { describe, it, expect, vi } from "vitest";

// Mock the database module before importing the module under test
// Extracted chain builders to reduce nesting depth
const makeWhereChain = () => ({
  get: vi.fn(() => undefined),
  all: vi.fn(() => []),
});

const makeFromChain = () => ({
  where: vi.fn(() => makeWhereChain()),
  get: vi.fn(() => undefined),
  all: vi.fn(() => []),
});

const makeTxInsertChain = () => ({
  values: vi.fn(),
});

vi.mock("#/infrastructure/persistence/drizzle", () => ({
  getDb: vi.fn(() => ({
    select: vi.fn(() => ({
      from: vi.fn(() => makeFromChain()),
    })),
    transaction: vi.fn(async (fn: (tx: unknown) => Promise<void>) => {
      const tx = {
        insert: vi.fn(() => makeTxInsertChain()),
      };
      await fn(tx);
    }),
  })),
}));

// Mock the auth module
vi.mock("./auth", () => ({
  hashPassword: vi.fn(() => "pbkdf2$mocksalt$mockhash"),
}));

import { createTenant } from "../superadminTenants";

describe("createTenant - validation", () => {
  it("returns 400 when body is null", async () => {
    const result = await createTenant(null);
    expect(result.status).toBe(400);
    if (result.status === 400) {
      expect(result.data.error).toBe("validation");
      expect(result.data.errors[0].field).toBe("body");
    }
  });

  it("returns 400 when body is undefined", async () => {
    const result = await createTenant(undefined);
    expect(result.status).toBe(400);
    if (result.status === 400) {
      expect(result.data.error).toBe("validation");
      expect(result.data.errors[0].field).toBe("body");
    }
  });

  it("returns 400 when body is not an object", async () => {
    const result = await createTenant("string");
    expect(result.status).toBe(400);
    if (result.status === 400) {
      expect(result.data.error).toBe("validation");
    }
  });

  it("returns 400 with all field errors when all fields are missing", async () => {
    const result = await createTenant({});
    expect(result.status).toBe(400);
    if (result.status === 400) {
      expect(result.data.error).toBe("validation");
      const fields = result.data.errors.map((e) => e.field);
      expect(fields).toContain("slug");
      expect(fields).toContain("name");
      expect(fields).toContain("timezone");
      expect(fields).toContain("adminUsername");
      expect(fields).toContain("adminPassword");
    }
  });

  it("returns 400 when password is too short (less than 8 chars)", async () => {
    const result = await createTenant({
      slug: "valid-slug",
      name: "Valid Name",
      timezone: "Asia/Jakarta",
      adminUsername: "admin_user",
      adminPassword: "short",
    });
    expect(result.status).toBe(400);
    if (result.status === 400) {
      expect(result.data.errors.some((e) => e.field === "adminPassword")).toBe(true);
    }
  });

  it("returns 400 when password is too long (more than 128 chars)", async () => {
    const result = await createTenant({
      slug: "valid-slug",
      name: "Valid Name",
      timezone: "Asia/Jakarta",
      adminUsername: "admin_user",
      adminPassword: "a".repeat(129),
    });
    expect(result.status).toBe(400);
    if (result.status === 400) {
      expect(result.data.errors.some((e) => e.field === "adminPassword")).toBe(true);
    }
  });

  it("returns 400 when password is not a string", async () => {
    const result = await createTenant({
      slug: "valid-slug",
      name: "Valid Name",
      timezone: "Asia/Jakarta",
      adminUsername: "admin_user",
      adminPassword: 12345678,
    });
    expect(result.status).toBe(400);
    if (result.status === 400) {
      expect(
        result.data.errors.some(
          (e) => e.field === "adminPassword" && e.message.includes("required"),
        ),
      ).toBe(true);
    }
  });

  it("normalizes slug to lowercase before validation", async () => {
    // A slug with uppercase should be normalized to lowercase
    // "Valid-Slug" becomes "valid-slug" which is valid
    const result = await createTenant({
      slug: "Valid-Slug",
      name: "Valid Name",
      timezone: "Asia/Jakarta",
      adminUsername: "admin_user",
      adminPassword: "password123",
    });
    // Should not fail on slug validation since it's normalized
    if (result.status === 400) {
      const slugErrors = result.data.errors.filter((e) => e.field === "slug");
      // Should not have uppercase-related errors
      expect(
        slugErrors.some((e) => e.message.includes("lowercase letters, digits, and hyphens")),
      ).toBe(false);
    }
  });

  it("accepts valid password at minimum length (8 chars)", async () => {
    const result = await createTenant({
      slug: "valid-slug",
      name: "Valid Name",
      timezone: "Asia/Jakarta",
      adminUsername: "admin_user",
      adminPassword: "12345678",
    });
    // Should not have password validation errors
    if (result.status === 400) {
      expect(result.data.errors.some((e) => e.field === "adminPassword")).toBe(false);
    } else {
      // If it passes validation, it should be 201 (with mocked DB)
      expect(result.status).toBe(201);
    }
  });

  it("accepts valid password at maximum length (128 chars)", async () => {
    const result = await createTenant({
      slug: "valid-slug",
      name: "Valid Name",
      timezone: "Asia/Jakarta",
      adminUsername: "admin_user",
      adminPassword: "a".repeat(128),
    });
    // Should not have password validation errors
    if (result.status === 400) {
      expect(result.data.errors.some((e) => e.field === "adminPassword")).toBe(false);
    } else {
      expect(result.status).toBe(201);
    }
  });

  it("returns 201 with valid data when no conflicts exist", async () => {
    const result = await createTenant({
      slug: "my-tenant",
      name: "My Tenant",
      timezone: "Asia/Jakarta",
      adminUsername: "admin_user",
      adminPassword: "securepassword123",
    });
    expect(result.status).toBe(201);
    if (result.status === 201) {
      expect(result.data.slug).toBe("my-tenant");
      expect(result.data.name).toBe("My Tenant");
      expect(result.data.tenantId).toBeDefined();
      expect(result.data.adminAccountId).toBeDefined();
    }
  });

  it("returns slug in lowercase in the response", async () => {
    const result = await createTenant({
      slug: "My-Tenant",
      name: "My Tenant",
      timezone: "Asia/Jakarta",
      adminUsername: "admin_user",
      adminPassword: "securepassword123",
    });
    if (result.status === 201) {
      expect(result.data.slug).toBe("my-tenant");
    }
  });

  it("returns 400 when slug has invalid characters", async () => {
    const result = await createTenant({
      slug: "my_tenant!",
      name: "My Tenant",
      timezone: "Asia/Jakarta",
      adminUsername: "admin_user",
      adminPassword: "securepassword123",
    });
    expect(result.status).toBe(400);
    if (result.status === 400) {
      expect(result.data.errors.some((e) => e.field === "slug")).toBe(true);
    }
  });

  it("returns 400 when timezone is invalid", async () => {
    const result = await createTenant({
      slug: "valid-slug",
      name: "Valid Name",
      timezone: "Invalid/Timezone",
      adminUsername: "admin_user",
      adminPassword: "securepassword123",
    });
    expect(result.status).toBe(400);
    if (result.status === 400) {
      expect(result.data.errors.some((e) => e.field === "timezone")).toBe(true);
    }
  });

  it("returns multiple validation errors when multiple fields are invalid", async () => {
    const result = await createTenant({
      slug: "x",
      name: "A",
      timezone: "Bad/TZ",
      adminUsername: "AB",
      adminPassword: "short",
    });
    expect(result.status).toBe(400);
    if (result.status === 400) {
      expect(result.data.errors.length).toBeGreaterThan(1);
    }
  });
});
