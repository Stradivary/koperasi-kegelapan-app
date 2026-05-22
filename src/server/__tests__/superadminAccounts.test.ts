import { describe, it, expect, vi, beforeEach } from "vitest";

// Mock the database module
const mockGet = vi.fn();
const mockAll = vi.fn();
const mockRun = vi.fn();

// Extracted chain builders to reduce nesting depth
const makeOrderByChain = () => ({
  limit: vi.fn(() => ({
    offset: vi.fn(() => ({
      all: mockAll,
    })),
  })),
});

const makeWhereChainWithJoin = () => ({
  orderBy: vi.fn(() => makeOrderByChain()),
  get: mockGet,
});

const makeWhereChain = () => ({
  get: mockGet,
  all: mockAll,
});

const makeFromChain = () => ({
  leftJoin: vi.fn(() => ({
    where: vi.fn(() => makeWhereChainWithJoin()),
  })),
  where: vi.fn(() => makeWhereChain()),
});

const makeInsertValuesChain = () => ({ run: mockRun });
const makeInsertChain = () => ({ values: vi.fn(() => makeInsertValuesChain()) });
const makeUpdateWhereChain = () => ({ run: mockRun });
const makeUpdateSetChain = () => ({ where: vi.fn(() => makeUpdateWhereChain()) });
const makeUpdateChain = () => ({ set: vi.fn(() => makeUpdateSetChain()) });

vi.mock("#/infrastructure/persistence/drizzle/index", () => ({
  getDb: vi.fn(() => ({
    select: vi.fn(() => ({
      from: vi.fn(() => makeFromChain()),
    })),
    insert: vi.fn(() => makeInsertChain()),
    update: vi.fn(() => makeUpdateChain()),
  })),
}));

// Mock auth module
vi.mock("./auth", () => ({
  hashPassword: vi.fn(() => "pbkdf2$salt$hash"),
  generateId: vi.fn(() => "generated-id-123"),
}));

import {
  listAccounts,
  createAccount,
  changeAccountPassword,
  updateAccountStatus,
} from "../superadminAccounts";

describe("superadminAccounts", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGet.mockResolvedValue(null);
    mockAll.mockResolvedValue([]);
    mockRun.mockResolvedValue({ success: true });
  });

  describe("listAccounts", () => {
    it("returns empty list with defaults", async () => {
      mockGet.mockResolvedValue({ value: 0 });
      mockAll.mockResolvedValue([]);
      const result = await listAccounts({});
      expect(result.accounts).toEqual([]);
      expect(result.page).toBe(1);
      expect(result.pageSize).toBe(20);
    });

    it("clamps pageSize to minimum 1", async () => {
      mockGet.mockResolvedValue({ value: 0 });
      mockAll.mockResolvedValue([]);
      const result = await listAccounts({ pageSize: -5 });
      expect(result.pageSize).toBe(20);
    });

    it("clamps pageSize to maximum 100", async () => {
      mockGet.mockResolvedValue({ value: 0 });
      mockAll.mockResolvedValue([]);
      const result = await listAccounts({ pageSize: 200 });
      expect(result.pageSize).toBe(100);
    });

    it("defaults page to 1 for invalid values", async () => {
      mockGet.mockResolvedValue({ value: 0 });
      mockAll.mockResolvedValue([]);
      const result = await listAccounts({ page: 0 });
      expect(result.page).toBe(1);
    });
  });

  describe("createAccount", () => {
    it("returns 400 for null body", async () => {
      const result = await createAccount(null);
      expect(result.status).toBe(400);
    });

    it("returns 400 for non-object body", async () => {
      const result = await createAccount("string");
      expect(result.status).toBe(400);
    });

    it("returns 400 for missing tenantId", async () => {
      const result = await createAccount({
        username: "user",
        password: "password123",
        role: "admin",
      });
      expect(result.status).toBe(400);
      if ("errors" in result.data) {
        expect(result.data.errors!.some((e) => e.field === "tenantId")).toBe(true);
      }
    });

    it("returns 400 for short username", async () => {
      const result = await createAccount({
        tenantId: "t1",
        username: "ab",
        password: "password123",
        role: "admin",
      });
      expect(result.status).toBe(400);
    });

    it("returns 400 for invalid username characters", async () => {
      const result = await createAccount({
        tenantId: "t1",
        username: "User Name",
        password: "password123",
        role: "admin",
      });
      expect(result.status).toBe(400);
    });

    it("returns 400 for short password", async () => {
      const result = await createAccount({
        tenantId: "t1",
        username: "validuser",
        password: "short",
        role: "admin",
      });
      expect(result.status).toBe(400);
    });

    it("returns 400 for invalid role", async () => {
      const result = await createAccount({
        tenantId: "t1",
        username: "validuser",
        password: "password123",
        role: "invalid",
      });
      expect(result.status).toBe(400);
    });

    it("returns 400 when tenant not found", async () => {
      mockGet.mockResolvedValue(null);
      const result = await createAccount({
        tenantId: "t1",
        username: "validuser",
        password: "password123",
        role: "admin",
      });
      expect(result.status).toBe(400);
      expect(result.data).toEqual({ error: "Tenant not found" });
    });

    it("returns 201 on success", async () => {
      mockGet.mockResolvedValue({ tenantId: "t1" });
      mockRun.mockResolvedValue({ success: true });
      const result = await createAccount({
        tenantId: "t1",
        username: "validuser",
        password: "password123",
        role: "admin",
      });
      expect(result.status).toBe(201);
      if (result.status === 201) {
        expect(result.data).toHaveProperty("accountId");
        expect(result.data).toHaveProperty("username", "validuser");
      }
    });

    it("returns 409 on UNIQUE constraint violation", async () => {
      mockGet.mockResolvedValue({ tenantId: "t1" });
      mockRun.mockRejectedValue(new Error("UNIQUE constraint failed"));
      const result = await createAccount({
        tenantId: "t1",
        username: "validuser",
        password: "password123",
        role: "admin",
      });
      expect(result.status).toBe(409);
    });

    it("accepts all valid roles", async () => {
      const roles = ["admin", "station", "gate", "terminal", "scout", "superadmin", "kiosk"];
      for (const role of roles) {
        mockGet.mockResolvedValue({ tenantId: "t1" });
        mockRun.mockResolvedValue({ success: true });
        const result = await createAccount({
          tenantId: "t1",
          username: "user",
          password: "password123",
          role,
        });
        expect(result.status).toBe(201);
      }
    });
  });

  describe("changeAccountPassword", () => {
    it("returns 400 for null body", async () => {
      const result = await changeAccountPassword(null);
      expect(result.status).toBe(400);
    });

    it("returns 400 for missing accountId", async () => {
      const result = await changeAccountPassword({ newPassword: "newpass123" });
      expect(result.status).toBe(400);
    });

    it("returns 400 for short password", async () => {
      const result = await changeAccountPassword({ accountId: "a1", newPassword: "short" });
      expect(result.status).toBe(400);
    });

    it("returns 400 for password exceeding 128 chars", async () => {
      const result = await changeAccountPassword({ accountId: "a1", newPassword: "a".repeat(129) });
      expect(result.status).toBe(400);
    });

    it("returns 404 when account not found", async () => {
      mockGet.mockResolvedValue(null);
      const result = await changeAccountPassword({ accountId: "a1", newPassword: "newpass123" });
      expect(result.status).toBe(404);
    });

    it("returns 200 on success", async () => {
      mockGet.mockResolvedValue({ accountId: "a1" });
      mockRun.mockResolvedValue({ success: true });
      const result = await changeAccountPassword({ accountId: "a1", newPassword: "newpass123" });
      expect(result.status).toBe(200);
      expect(result.data).toEqual({ ok: true });
    });
  });

  describe("updateAccountStatus", () => {
    it("returns 400 for null body", async () => {
      const result = await updateAccountStatus(null);
      expect(result.status).toBe(400);
    });

    it("returns 400 for missing accountId", async () => {
      const result = await updateAccountStatus({ status: "active" });
      expect(result.status).toBe(400);
    });

    it("returns 400 for invalid status", async () => {
      const result = await updateAccountStatus({ accountId: "a1", status: "invalid" });
      expect(result.status).toBe(400);
    });

    it("returns 404 when account not found", async () => {
      mockGet.mockResolvedValue(null);
      const result = await updateAccountStatus({ accountId: "a1", status: "active" });
      expect(result.status).toBe(404);
    });

    it("returns 200 on success with active status", async () => {
      mockGet.mockResolvedValue({ accountId: "a1" });
      mockRun.mockResolvedValue({ success: true });
      const result = await updateAccountStatus({ accountId: "a1", status: "active" });
      expect(result.status).toBe(200);
      if (result.status === 200) {
        expect(result.data).toEqual({ ok: true, accountId: "a1", status: "active" });
      }
    });

    it("returns 200 on success with suspended status", async () => {
      mockGet.mockResolvedValue({ accountId: "a1" });
      mockRun.mockResolvedValue({ success: true });
      const result = await updateAccountStatus({ accountId: "a1", status: "suspended" });
      expect(result.status).toBe(200);
    });
  });
});
