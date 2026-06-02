import { describe, it, expect, vi, beforeEach } from "vitest";
import { buildSelectChain } from "./dbMocks";

// ---------------------------------------------------------------------------
// DB mock factory - returns a configurable mock per test
// ---------------------------------------------------------------------------

const mockUpdate = vi.fn();
const mockSelect = vi.fn();
const mockInsert = vi.fn();
const mockTransaction = vi.fn();

vi.mock("#/infrastructure/persistence/drizzle", () => ({
  getDb: vi.fn(() => ({
    select: mockSelect,
    update: mockUpdate,
    insert: mockInsert,
    transaction: mockTransaction,
  })),
}));

vi.mock("./auth", () => ({
  hashPassword: vi.fn(() => "pbkdf2$salt$hash"),
}));

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

import {
  listTenants,
  getTenantDetail,
  updateTenantStatus,
  createTenant,
} from "../superadminTenants";

describe("listTenants", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns paginated tenant list with defaults", async () => {
    const countChain = buildSelectChain({ value: 2 });
    const tenantsChain = {
      from: vi.fn().mockReturnThis(),
      where: vi.fn().mockReturnThis(),
      orderBy: vi.fn().mockReturnThis(),
      limit: vi.fn().mockReturnThis(),
      offset: vi.fn().mockReturnThis(),
      all: vi.fn().mockResolvedValue([
        {
          tenantId: "t1",
          slug: "tenant-one",
          name: "Tenant One",
          status: "active",
          timezone: "Asia/Jakarta",
          createdAt: "2024-01-01T00:00:00.000Z",
          accountCount: 3,
        },
        {
          tenantId: "t2",
          slug: "tenant-two",
          name: "Tenant Two",
          status: "suspended",
          timezone: "UTC",
          createdAt: new Date("2024-02-01"),
          accountCount: 1,
        },
      ]),
    };

    mockSelect.mockReturnValueOnce(countChain).mockReturnValueOnce(tenantsChain);

    const result = await listTenants({});

    expect(result.total).toBe(2);
    expect(result.page).toBe(1);
    expect(result.pageSize).toBe(20);
    expect(result.tenants).toHaveLength(2);
    expect(result.tenants[0].tenantId).toBe("t1");
    expect(result.tenants[1].createdAt).toMatch(/2024-02-01/);
  });

  it("clamps pageSize below 1 to 20", async () => {
    const countChain = buildSelectChain({ value: 0 });
    const tenantsChain = { ...buildSelectChain([]), all: vi.fn().mockResolvedValue([]) };
    mockSelect.mockReturnValueOnce(countChain).mockReturnValueOnce(tenantsChain);

    const result = await listTenants({ pageSize: 0 });
    expect(result.pageSize).toBe(20);
  });

  it("clamps pageSize above 100 to 100", async () => {
    const countChain = buildSelectChain({ value: 0 });
    const tenantsChain = { ...buildSelectChain([]), all: vi.fn().mockResolvedValue([]) };
    mockSelect.mockReturnValueOnce(countChain).mockReturnValueOnce(tenantsChain);

    const result = await listTenants({ pageSize: 999 });
    expect(result.pageSize).toBe(100);
  });

  it("clamps page below 1 to 1", async () => {
    const countChain = buildSelectChain({ value: 0 });
    const tenantsChain = { ...buildSelectChain([]), all: vi.fn().mockResolvedValue([]) };
    mockSelect.mockReturnValueOnce(countChain).mockReturnValueOnce(tenantsChain);

    const result = await listTenants({ page: -5 });
    expect(result.page).toBe(1);
  });

  it("applies search filter when search param is provided", async () => {
    const countChain = buildSelectChain({ value: 1 });
    const tenantsChain = {
      from: vi.fn().mockReturnThis(),
      where: vi.fn().mockReturnThis(),
      orderBy: vi.fn().mockReturnThis(),
      limit: vi.fn().mockReturnThis(),
      offset: vi.fn().mockReturnThis(),
      all: vi.fn().mockResolvedValue([
        {
          tenantId: "t1",
          slug: "my-tenant",
          name: "My Tenant",
          status: "active",
          timezone: "UTC",
          createdAt: "2024-01-01",
          accountCount: 0,
        },
      ]),
    };
    mockSelect.mockReturnValueOnce(countChain).mockReturnValueOnce(tenantsChain);

    const result = await listTenants({ search: "my" });
    expect(result.tenants[0].slug).toBe("my-tenant");
  });

  it("returns total=0 when count query returns undefined", async () => {
    const countChain = buildSelectChain(undefined);
    const tenantsChain = { ...buildSelectChain([]), all: vi.fn().mockResolvedValue([]) };
    mockSelect.mockReturnValueOnce(countChain).mockReturnValueOnce(tenantsChain);

    const result = await listTenants({});
    expect(result.total).toBe(0);
  });
});

describe("getTenantDetail", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns 404 when tenant is not found", async () => {
    const tenantChain = buildSelectChain(undefined);
    mockSelect.mockReturnValueOnce(tenantChain);

    const result = await getTenantDetail("nonexistent-id");
    expect(result.status).toBe(404);
    if (result.status === 404) {
      expect(result.data.error).toMatch(/not found/i);
    }
  });

  it("returns 200 with tenant detail and accounts when found", async () => {
    const tenantChain = buildSelectChain({
      tenantId: "t1",
      slug: "my-tenant",
      name: "My Tenant",
      status: "active",
      timezone: "Asia/Jakarta",
      createdAt: new Date("2024-01-01"),
      updatedAt: new Date("2024-06-01"),
    });
    const accountsChain = {
      ...buildSelectChain([]),
      all: vi.fn().mockResolvedValue([
        {
          accountId: "a1",
          username: "admin",
          role: "admin",
          status: "active",
          createdAt: new Date("2024-01-01"),
        },
      ]),
    };
    mockSelect.mockReturnValueOnce(tenantChain).mockReturnValueOnce(accountsChain);

    const result = await getTenantDetail("t1");
    expect(result.status).toBe(200);
    if (result.status === 200) {
      expect(result.data.tenantId).toBe("t1");
      expect(result.data.accounts).toHaveLength(1);
      expect(result.data.accounts[0].username).toBe("admin");
      expect(result.data.createdAt).toMatch(/2024-01-01/);
    }
  });

  it("handles string createdAt/updatedAt (non-Date) gracefully", async () => {
    const tenantChain = buildSelectChain({
      tenantId: "t1",
      slug: "my-tenant",
      name: "My Tenant",
      status: "active",
      timezone: "UTC",
      createdAt: 1700000000,
      updatedAt: 1700000001,
    });
    const accountsChain = { ...buildSelectChain([]), all: vi.fn().mockResolvedValue([]) };
    mockSelect.mockReturnValueOnce(tenantChain).mockReturnValueOnce(accountsChain);

    const result = await getTenantDetail("t1");
    expect(result.status).toBe(200);
    if (result.status === 200) {
      expect(result.data.createdAt).toBe("1700000000");
    }
  });
});

describe("updateTenantStatus", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns 404 when tenant does not exist", async () => {
    const tenantChain = buildSelectChain(undefined);
    mockSelect.mockReturnValueOnce(tenantChain);

    const result = await updateTenantStatus("nonexistent", "suspended");
    expect(result.status).toBe(404);
    if (result.status === 404) {
      expect(result.data.error).toBe("not_found");
    }
  });

  it("returns 422 for invalid transition (archived → active)", async () => {
    const tenantChain = buildSelectChain({ tenantId: "t1", status: "archived" });
    mockSelect.mockReturnValueOnce(tenantChain);

    const result = await updateTenantStatus("t1", "active");
    expect(result.status).toBe(422);
    if (result.status === 422) {
      expect(result.data.error).toBe("invalid_transition");
      expect(result.data.message).toContain("archived");
    }
  });

  it("returns 422 for invalid transition (archived → suspended)", async () => {
    const tenantChain = buildSelectChain({ tenantId: "t1", status: "archived" });
    mockSelect.mockReturnValueOnce(tenantChain);

    const result = await updateTenantStatus("t1", "suspended");
    expect(result.status).toBe(422);
  });

  it("returns 200 for valid transition (active → suspended)", async () => {
    const tenantChain = buildSelectChain({ tenantId: "t1", status: "active" });
    mockSelect.mockReturnValueOnce(tenantChain);

    const updateChain = {
      set: vi.fn().mockReturnThis(),
      where: vi.fn().mockResolvedValue(undefined),
    };
    mockUpdate.mockReturnValue(updateChain);

    const result = await updateTenantStatus("t1", "suspended");
    expect(result.status).toBe(200);
    if (result.status === 200) {
      expect(result.data.tenantId).toBe("t1");
      expect(result.data.status).toBe("suspended");
      expect(result.data.updatedAt).toBeDefined();
    }
  });

  it("returns 200 for valid transition (active → archived)", async () => {
    const tenantChain = buildSelectChain({ tenantId: "t1", status: "active" });
    mockSelect.mockReturnValueOnce(tenantChain);
    const updateChain = {
      set: vi.fn().mockReturnThis(),
      where: vi.fn().mockResolvedValue(undefined),
    };
    mockUpdate.mockReturnValue(updateChain);

    const result = await updateTenantStatus("t1", "archived");
    expect(result.status).toBe(200);
    if (result.status === 200) {
      expect(result.data.status).toBe("archived");
    }
  });

  it("returns 200 for valid transition (suspended → active)", async () => {
    const tenantChain = buildSelectChain({ tenantId: "t1", status: "suspended" });
    mockSelect.mockReturnValueOnce(tenantChain);
    const updateChain = {
      set: vi.fn().mockReturnThis(),
      where: vi.fn().mockResolvedValue(undefined),
    };
    mockUpdate.mockReturnValue(updateChain);

    const result = await updateTenantStatus("t1", "active");
    expect(result.status).toBe(200);
  });

  it("returns 422 for same-status transition (active → active)", async () => {
    const tenantChain = buildSelectChain({ tenantId: "t1", status: "active" });
    mockSelect.mockReturnValueOnce(tenantChain);

    const result = await updateTenantStatus("t1", "active");
    expect(result.status).toBe(422);
  });

  it("includes allowed transitions in the 422 message", async () => {
    const tenantChain = buildSelectChain({ tenantId: "t1", status: "active" });
    mockSelect.mockReturnValueOnce(tenantChain);

    const result = await updateTenantStatus("t1", "active");
    if (result.status === 422) {
      expect(result.data.message).toContain("suspended");
    }
  });

  it("returns 422 with empty allowed list for archived status", async () => {
    const tenantChain = buildSelectChain({ tenantId: "t1", status: "archived" });
    mockSelect.mockReturnValueOnce(tenantChain);

    const result = await updateTenantStatus("t1", "active");
    if (result.status === 422) {
      expect(result.data.message).toContain("none");
    }
  });
});

describe("createTenant - conflict paths", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  function makeValidBody() {
    return {
      slug: "new-tenant",
      name: "New Tenant",
      timezone: "Asia/Jakarta",
      adminUsername: "admin_user",
      adminPassword: "securepassword123",
    };
  }

  it("returns 409 slug_only when slug already exists", async () => {
    // First select: slug check → found; second: username check → not found
    const slugChain = buildSelectChain({ tenantId: "t1", slug: "new-tenant", name: "Existing" });
    const userChain = buildSelectChain(undefined);
    mockSelect.mockReturnValueOnce(slugChain).mockReturnValueOnce(userChain);

    const result = await createTenant(makeValidBody());
    expect(result.status).toBe(409);
    if (result.status === 409) {
      expect(result.data.conflictType).toBe("slug_only");
      expect(result.data.existingTenantName).toBe("Existing");
    }
  });

  it("returns 409 admin_only when username already exists", async () => {
    // slug check → not found; username check → found
    const slugChain = buildSelectChain(undefined);
    const userChain = buildSelectChain({ accountId: "a1", tenantId: "t2", username: "admin_user" });
    // conflict tenant lookup
    const conflictTenantChain = buildSelectChain({ slug: "other-tenant", name: "Other Tenant" });
    mockSelect
      .mockReturnValueOnce(slugChain)
      .mockReturnValueOnce(userChain)
      .mockReturnValueOnce(conflictTenantChain);

    const result = await createTenant(makeValidBody());
    expect(result.status).toBe(409);
    if (result.status === 409) {
      expect(result.data.conflictType).toBe("admin_only");
      expect(result.data.existingTenantName).toBe("Other Tenant");
    }
  });

  it("returns 409 admin_only with Unknown when conflict tenant not found", async () => {
    const slugChain = buildSelectChain(undefined);
    const userChain = buildSelectChain({ accountId: "a1", tenantId: "t2", username: "admin_user" });
    const conflictTenantChain = buildSelectChain(undefined); // tenant not found
    mockSelect
      .mockReturnValueOnce(slugChain)
      .mockReturnValueOnce(userChain)
      .mockReturnValueOnce(conflictTenantChain);

    const result = await createTenant(makeValidBody());
    expect(result.status).toBe(409);
    if (result.status === 409) {
      expect(result.data.existingTenantName).toBe("Unknown");
    }
  });

  it("returns 409 slug_and_admin when both slug and username exist", async () => {
    const slugChain = buildSelectChain({ tenantId: "t1", slug: "new-tenant", name: "Existing" });
    const userChain = buildSelectChain({ accountId: "a1", tenantId: "t1", username: "admin_user" });
    mockSelect.mockReturnValueOnce(slugChain).mockReturnValueOnce(userChain);

    const result = await createTenant(makeValidBody());
    expect(result.status).toBe(409);
    if (result.status === 409) {
      expect(result.data.conflictType).toBe("slug_and_admin");
    }
  });

  it("handles UNIQUE constraint error during transaction - slug conflict", async () => {
    // Pre-checks pass (no conflict found)
    const slugChain = buildSelectChain(undefined);
    const userChain = buildSelectChain(undefined);
    // Re-check after constraint error: slug found
    const recheckSlugChain = buildSelectChain({
      tenantId: "t1",
      slug: "new-tenant",
      name: "Race Tenant",
    });
    const recheckUserChain = buildSelectChain(undefined);

    mockSelect
      .mockReturnValueOnce(slugChain)
      .mockReturnValueOnce(userChain)
      .mockReturnValueOnce(recheckSlugChain)
      .mockReturnValueOnce(recheckUserChain);

    mockTransaction.mockRejectedValueOnce(new Error("UNIQUE constraint failed: tenants.slug"));

    const result = await createTenant(makeValidBody());
    expect(result.status).toBe(409);
    if (result.status === 409) {
      expect(result.data.conflictType).toBe("slug_only");
    }
  });

  it("handles UNIQUE constraint error during transaction - both conflict", async () => {
    const slugChain = buildSelectChain(undefined);
    const userChain = buildSelectChain(undefined);
    const recheckSlugChain = buildSelectChain({ tenantId: "t1", slug: "new-tenant", name: "Race" });
    const recheckUserChain = buildSelectChain({ accountId: "a1", tenantId: "t1" });

    mockSelect
      .mockReturnValueOnce(slugChain)
      .mockReturnValueOnce(userChain)
      .mockReturnValueOnce(recheckSlugChain)
      .mockReturnValueOnce(recheckUserChain);

    mockTransaction.mockRejectedValueOnce(new Error("UNIQUE constraint failed"));

    const result = await createTenant(makeValidBody());
    expect(result.status).toBe(409);
    if (result.status === 409) {
      expect(result.data.conflictType).toBe("slug_and_admin");
    }
  });

  it("handles UNIQUE constraint error - admin_only race condition", async () => {
    const slugChain = buildSelectChain(undefined);
    const userChain = buildSelectChain(undefined);
    const recheckSlugChain = buildSelectChain(undefined); // slug no longer conflicts
    const recheckUserChain = buildSelectChain({ accountId: "a1", tenantId: "t2" });
    const conflictTenantChain = buildSelectChain({ slug: "other", name: "Other" });

    mockSelect
      .mockReturnValueOnce(slugChain)
      .mockReturnValueOnce(userChain)
      .mockReturnValueOnce(recheckSlugChain)
      .mockReturnValueOnce(recheckUserChain)
      .mockReturnValueOnce(conflictTenantChain);

    mockTransaction.mockRejectedValueOnce(new Error("UNIQUE constraint failed"));

    const result = await createTenant(makeValidBody());
    expect(result.status).toBe(409);
    if (result.status === 409) {
      expect(result.data.conflictType).toBe("admin_only");
    }
  });

  it("handles UNIQUE constraint error - fallback when recheck finds nothing", async () => {
    const slugChain = buildSelectChain(undefined);
    const userChain = buildSelectChain(undefined);
    const recheckSlugChain = buildSelectChain(undefined);
    const recheckUserChain = buildSelectChain(undefined);

    mockSelect
      .mockReturnValueOnce(slugChain)
      .mockReturnValueOnce(userChain)
      .mockReturnValueOnce(recheckSlugChain)
      .mockReturnValueOnce(recheckUserChain);

    mockTransaction.mockRejectedValueOnce(new Error("UNIQUE constraint failed"));

    const result = await createTenant(makeValidBody());
    expect(result.status).toBe(409);
    if (result.status === 409) {
      expect(result.data.conflictType).toBe("slug_and_admin");
    }
  });

  it("rethrows non-constraint errors", async () => {
    const slugChain = buildSelectChain(undefined);
    const userChain = buildSelectChain(undefined);
    mockSelect.mockReturnValueOnce(slugChain).mockReturnValueOnce(userChain);
    mockTransaction.mockRejectedValueOnce(new Error("Database connection lost"));

    await expect(createTenant(makeValidBody())).rejects.toThrow("Database connection lost");
  });
});
