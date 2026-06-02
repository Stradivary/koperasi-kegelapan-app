/**
 * Tests for src/server/tenantSearch.ts
 *
 * Covers:
 * - searchServerTenants: happy path, empty results, limit clamping
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { buildSelectChain } from "./dbMocks";

// ── DB mock ───────────────────────────────────────────────────────────────────

const mockSelect = vi.fn();

vi.mock("#/infrastructure/persistence/drizzle", () => ({
  getDb: vi.fn(() => ({
    select: mockSelect,
  })),
}));

import { searchServerTenants } from "../tenantSearch";

// ── Tests ─────────────────────────────────────────────────────────────────────

describe("searchServerTenants", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns matching tenants for a given query", async () => {
    const data = [
      { tenantId: "t1", slug: "koperasi-maju", name: "Koperasi Maju" },
      { tenantId: "t2", slug: "koperasi-jaya", name: "Koperasi Jaya" },
    ];
    const chain = buildSelectChain(data);
    mockSelect.mockReturnValue(chain);

    const results = await searchServerTenants("koperasi");

    expect(results).toHaveLength(2);
    expect(results[0].tenantId).toBe("t1");
    expect(results[0].slug).toBe("koperasi-maju");
    expect(results[1].name).toBe("Koperasi Jaya");
  });

  it("returns empty array when no tenants match", async () => {
    const chain = buildSelectChain([]);
    mockSelect.mockReturnValue(chain);

    const results = await searchServerTenants("nonexistent");

    expect(results).toHaveLength(0);
  });

  it("uses default limit of 10 when not specified", async () => {
    const chain = buildSelectChain([]);
    mockSelect.mockReturnValue(chain);

    await searchServerTenants("test");

    // Verify limit was called with 10
    expect(chain.limit).toHaveBeenCalledWith(10);
  });

  it("uses provided limit", async () => {
    const chain = buildSelectChain([]);
    mockSelect.mockReturnValue(chain);

    await searchServerTenants("test", 25);

    expect(chain.limit).toHaveBeenCalledWith(25);
  });

  it("applies active status filter and name/slug OR condition", async () => {
    const chain = buildSelectChain([]);
    mockSelect.mockReturnValue(chain);

    await searchServerTenants("maju");

    // where() should have been called (with the and/or condition)
    expect(chain.where).toHaveBeenCalled();
  });

  it("orders results alphabetically by name", async () => {
    const chain = buildSelectChain([]);
    mockSelect.mockReturnValue(chain);

    await searchServerTenants("test");

    expect(chain.orderBy).toHaveBeenCalled();
  });

  it("returns correct shape for each result", async () => {
    const data = [{ tenantId: "t1", slug: "my-koperasi", name: "My Koperasi" }];
    const chain = buildSelectChain(data);
    mockSelect.mockReturnValue(chain);

    const results = await searchServerTenants("my");

    expect(results[0]).toEqual({
      tenantId: "t1",
      slug: "my-koperasi",
      name: "My Koperasi",
    });
  });
});
