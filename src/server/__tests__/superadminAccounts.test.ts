// @vitest-environment node
/**
 * Tests for src/server/superadminAccounts.ts
 * Covers: listAccounts, createAccount, changeAccountPassword, updateAccountStatus
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

// ── DB mock ──────────────────────────────────────────────────────────────────

const mockDb: Record<string, ReturnType<typeof vi.fn>> = {};

vi.mock("#/infrastructure/persistence/drizzle", () => ({
  getDb: vi.fn(() => mockDb),
}));

vi.mock("#/infrastructure/persistence/drizzle/schema", () => ({
  accounts: {
    accountId: "accounts.accountId",
    tenantId: "accounts.tenantId",
    username: "accounts.username",
    passwordHash: "accounts.passwordHash",
    role: "accounts.role",
    status: "accounts.status",
    createdAt: "accounts.createdAt",
    updatedAt: "accounts.updatedAt",
  },
  tenants: {
    tenantId: "tenants.tenantId",
    name: "tenants.name",
    slug: "tenants.slug",
  },
}));

vi.mock("drizzle-orm", () => ({
  eq: vi.fn((a: unknown, b: unknown) => ({ eq: [a, b] })),
  sql: vi.fn((strings: TemplateStringsArray, ...values: unknown[]) => ({ sql: strings, values })),
  like: vi.fn((a: unknown, b: unknown) => ({ like: [a, b] })),
  or: vi.fn((...args: unknown[]) => ({ or: args })),
  desc: vi.fn((a: unknown) => ({ desc: a })),
  count: vi.fn(() => ({ count: true })),
}));

vi.mock("#/core/auth/authRules", () => ({
  hashPassword: vi.fn((pw: string) => `hashed:${pw}`),
  generateId: vi.fn(() => "generated-id-123"),
}));

// ── Helpers ──────────────────────────────────────────────────────────────────

import {
  listAccounts,
  createAccount,
  changeAccountPassword,
  updateAccountStatus,
} from "../superadminAccounts";

function setupSelectChain(rows: unknown[] = []) {
  mockDb.select = vi.fn().mockReturnValue(mockDb);
  mockDb.from = vi.fn().mockReturnValue(mockDb);
  mockDb.leftJoin = vi.fn().mockReturnValue(mockDb);
  mockDb.where = vi.fn().mockReturnValue(mockDb);
  mockDb.orderBy = vi.fn().mockReturnValue(mockDb);
  mockDb.limit = vi.fn().mockReturnValue(mockDb);
  mockDb.offset = vi.fn().mockReturnValue(mockDb);
  mockDb.all = vi.fn().mockResolvedValue(rows);
  mockDb.get = vi.fn().mockResolvedValue(rows[0] ?? null);
}

function setupInsertChain(opts: { throws?: Error } = {}) {
  const runFn = opts.throws
    ? vi.fn().mockRejectedValue(opts.throws)
    : vi.fn().mockResolvedValue({});
  mockDb.insert = vi.fn().mockReturnValue({
    values: vi.fn().mockReturnValue({ run: runFn }),
  });
}

function setupUpdateChain() {
  mockDb.update = vi.fn().mockReturnValue({
    set: vi.fn().mockReturnValue({
      where: vi.fn().mockReturnValue({ run: vi.fn().mockResolvedValue({}) }),
    }),
  });
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe("listAccounts", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    setupSelectChain();
  });

  it("returns empty list when no accounts exist", async () => {
    const result = await listAccounts({});
    expect(result.accounts).toEqual([]);
    expect(result.total).toBe(0);
  });

  it("returns accounts with default pagination", async () => {
    setupSelectChain([
      {
        accountId: "a-1",
        tenantId: "t-1",
        tenantName: "Test Tenant",
        tenantSlug: "test",
        username: "admin",
        role: "admin",
        status: "active",
        createdAt: new Date("2024-01-01"),
      },
    ]);
    mockDb.get = vi.fn().mockResolvedValue({ value: 1 });

    const result = await listAccounts({});
    expect(result.accounts).toHaveLength(1);
    expect(result.page).toBe(1);
    expect(result.pageSize).toBe(20);
    expect(result.total).toBe(1);
  });

  it("accepts custom page and pageSize", async () => {
    setupSelectChain([]);
    mockDb.get = vi.fn().mockResolvedValue({ value: 0 });

    const result = await listAccounts({ page: 2, pageSize: 50 });
    expect(result.page).toBe(2);
    expect(result.pageSize).toBe(50);
  });

  it("limits pageSize to maximum of 100", async () => {
    setupSelectChain([]);
    mockDb.get = vi.fn().mockResolvedValue({ value: 0 });

    const result = await listAccounts({ pageSize: 200 });
    expect(result.pageSize).toBe(100);
  });

  it("defaults to page 1 when page is invalid", async () => {
    setupSelectChain([]);
    mockDb.get = vi.fn().mockResolvedValue({ value: 0 });

    const result = await listAccounts({ page: -1 });
    expect(result.page).toBe(1);
  });

  it("accepts search parameter", async () => {
    setupSelectChain([]);
    mockDb.get = vi.fn().mockResolvedValue({ value: 0 });

    const result = await listAccounts({ search: "admin" });
    expect(result.accounts).toEqual([]);
  });
});

describe("createAccount", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    setupSelectChain([{ tenantId: "t-1" }]);
    setupInsertChain();
  });

  it("returns 400 when body is invalid", async () => {
    const result = await createAccount(null);
    expect(result.status).toBe(400);
    expect(result.data).toHaveProperty("error");
  });

  it("returns 400 when tenantId is missing", async () => {
    const result = await createAccount({
      username: "admin",
      password: "password123",
      role: "admin",
    });
    expect(result.status).toBe(400);
    expect(result.data).toHaveProperty("errors");
  });

  it("returns 400 when username is too short", async () => {
    const result = await createAccount({
      tenantId: "t-1",
      username: "ab",
      password: "password123",
      role: "admin",
    });
    expect(result.status).toBe(400);
  });

  it("returns 400 when username contains invalid characters", async () => {
    const result = await createAccount({
      tenantId: "t-1",
      username: "Admin@123",
      password: "password123",
      role: "admin",
    });
    expect(result.status).toBe(400);
  });

  it("returns 400 when password is too short", async () => {
    const result = await createAccount({
      tenantId: "t-1",
      username: "admin",
      password: "short",
      role: "admin",
    });
    expect(result.status).toBe(400);
  });

  it("returns 400 when role is invalid", async () => {
    const result = await createAccount({
      tenantId: "t-1",
      username: "admin",
      password: "password123",
      role: "invalid",
    });
    expect(result.status).toBe(400);
  });

  it("returns 400 when tenant not found", async () => {
    setupSelectChain([]);
    mockDb.get = vi.fn().mockResolvedValue(null);

    const result = await createAccount({
      tenantId: "nonexistent",
      username: "admin",
      password: "password123",
      role: "admin",
    });
    expect(result.status).toBe(400);
    expect(result.data).toHaveProperty("error", "Tenant not found");
  });

  it("returns 201 on successful creation", async () => {
    const result = await createAccount({
      tenantId: "t-1",
      username: "admin",
      password: "password123",
      role: "admin",
    });
    expect(result.status).toBe(201);
    expect(result.data).toHaveProperty("accountId", "generated-id-123");
    expect(result.data).toHaveProperty("username", "admin");
  });

  it("accepts all valid roles", async () => {
    const validRoles = ["admin", "station", "gate", "terminal", "scout", "superadmin", "kiosk"];
    for (const role of validRoles) {
      setupInsertChain();
      const result = await createAccount({
        tenantId: "t-1",
        username: "user",
        password: "password123",
        role,
      });
      expect(result.status).toBe(201);
    }
  });

  it("returns 409 when username already exists", async () => {
    setupInsertChain({ throws: new Error("UNIQUE constraint failed") });

    const result = await createAccount({
      tenantId: "t-1",
      username: "existing",
      password: "password123",
      role: "admin",
    });
    expect(result.status).toBe(409);
    expect(result.data).toHaveProperty("error", "Username already exists");
  });

  it("trims whitespace from username", async () => {
    const result = await createAccount({
      tenantId: "t-1",
      username: "  admin  ",
      password: "password123",
      role: "admin",
    });
    expect(result.status).toBe(201);
    expect(result.data).toHaveProperty("username", "admin");
  });
});

describe("changeAccountPassword", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    setupSelectChain([{ accountId: "a-1" }]);
    setupUpdateChain();
  });

  it("returns 400 when body is invalid", async () => {
    const result = await changeAccountPassword(null);
    expect(result.status).toBe(400);
    expect(result.data).toHaveProperty("error");
  });

  it("returns 400 when accountId is missing", async () => {
    const result = await changeAccountPassword({ newPassword: "newpass123" });
    expect(result.status).toBe(400);
  });

  it("returns 400 when newPassword is too short", async () => {
    const result = await changeAccountPassword({ accountId: "a-1", newPassword: "short" });
    expect(result.status).toBe(400);
  });

  it("returns 400 when newPassword is too long", async () => {
    const longPassword = "a".repeat(129);
    const result = await changeAccountPassword({ accountId: "a-1", newPassword: longPassword });
    expect(result.status).toBe(400);
    expect(result.data).toHaveProperty("error");
  });

  it("returns 404 when account not found", async () => {
    setupSelectChain([]);
    mockDb.get = vi.fn().mockResolvedValue(null);

    const result = await changeAccountPassword({
      accountId: "nonexistent",
      newPassword: "newpass123",
    });
    expect(result.status).toBe(404);
    expect(result.data).toHaveProperty("error", "Account not found");
  });

  it("returns 200 on successful password change", async () => {
    const result = await changeAccountPassword({ accountId: "a-1", newPassword: "newpass123" });
    expect(result.status).toBe(200);
    expect(result.data).toHaveProperty("ok", true);
  });

  it("accepts minimum password length of 8 characters", async () => {
    const result = await changeAccountPassword({ accountId: "a-1", newPassword: "12345678" });
    expect(result.status).toBe(200);
  });

  it("accepts maximum password length of 128 characters", async () => {
    const maxPassword = "a".repeat(128);
    const result = await changeAccountPassword({ accountId: "a-1", newPassword: maxPassword });
    expect(result.status).toBe(200);
  });
});

describe("updateAccountStatus", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    setupSelectChain([{ accountId: "a-1" }]);
    setupUpdateChain();
  });

  it("returns 400 when body is invalid", async () => {
    const result = await updateAccountStatus(null);
    expect(result.status).toBe(400);
    expect(result.data).toHaveProperty("error");
  });

  it("returns 400 when accountId is missing", async () => {
    const result = await updateAccountStatus({ status: "active" });
    expect(result.status).toBe(400);
  });

  it("returns 400 when status is invalid", async () => {
    const result = await updateAccountStatus({ accountId: "a-1", status: "deleted" });
    expect(result.status).toBe(400);
  });

  it("returns 404 when account not found", async () => {
    setupSelectChain([]);
    mockDb.get = vi.fn().mockResolvedValue(null);

    const result = await updateAccountStatus({ accountId: "nonexistent", status: "active" });
    expect(result.status).toBe(404);
    expect(result.data).toHaveProperty("error", "Account not found");
  });

  it("returns 200 when status is set to active", async () => {
    const result = await updateAccountStatus({ accountId: "a-1", status: "active" });
    expect(result.status).toBe(200);
    expect(result.data).toHaveProperty("ok", true);
    expect(result.data).toHaveProperty("status", "active");
  });

  it("returns 200 when status is set to suspended", async () => {
    const result = await updateAccountStatus({ accountId: "a-1", status: "suspended" });
    expect(result.status).toBe(200);
    expect(result.data).toHaveProperty("status", "suspended");
  });
});
