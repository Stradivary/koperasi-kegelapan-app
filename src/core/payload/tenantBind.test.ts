/**
 * Unit tests for tenantBind - FNV-32a hash and tenant binding validation.
 *
 * Security-critical: the tenantBind === 0 legacy bypass allows any card with
 * a zero binding to pass tenant validation. This must be explicitly tested.
 */

import { describe, it, expect } from "vitest";
import { fnv32a, encodeTenantBind, isTenantBindValid } from "./tenantBind";

// ---------------------------------------------------------------------------
// fnv32a
// ---------------------------------------------------------------------------

describe("fnv32a", () => {
  it("returns a 32-bit unsigned integer (number in [0, 2^32))", () => {
    const result = fnv32a("hello");
    expect(result).toBeGreaterThanOrEqual(0);
    expect(result).toBeLessThan(2 ** 32);
    expect(Number.isInteger(result)).toBe(true);
  });

  it("is deterministic for the same input", () => {
    expect(fnv32a("tenant-abc")).toBe(fnv32a("tenant-abc"));
  });

  it("produces different hashes for different inputs", () => {
    expect(fnv32a("tenant-abc")).not.toBe(fnv32a("tenant-xyz"));
    expect(fnv32a("a")).not.toBe(fnv32a("b"));
  });

  it("is case-sensitive", () => {
    expect(fnv32a("Tenant")).not.toBe(fnv32a("tenant"));
  });

  it("handles empty string without throwing", () => {
    const result = fnv32a("");
    // FNV-32a offset basis for empty input is 0x811c9dc5
    expect(result).toBe(0x811c9dc5);
  });

  it("handles single character", () => {
    const result = fnv32a("a");
    expect(result).toBeGreaterThanOrEqual(0);
    expect(result).toBeLessThan(2 ** 32);
  });

  it("handles long strings", () => {
    const long = "a".repeat(1000);
    const result = fnv32a(long);
    expect(result).toBeGreaterThanOrEqual(0);
    expect(result).toBeLessThan(2 ** 32);
  });

  it("handles unicode characters", () => {
    // Should not throw; result is deterministic
    const r1 = fnv32a("koperasi-ñ");
    const r2 = fnv32a("koperasi-ñ");
    expect(r1).toBe(r2);
  });

  it("known vector: 'foobar' produces a stable hash", () => {
    // FNV-32a("foobar") = 0xbf9cf968 - computed from the spec
    expect(fnv32a("foobar")).toBe(0xbf9cf968);
  });
});

// ---------------------------------------------------------------------------
// encodeTenantBind
// ---------------------------------------------------------------------------

describe("encodeTenantBind", () => {
  it("returns the same value as fnv32a", () => {
    const tenantId = "tenant-abc";
    expect(encodeTenantBind(tenantId)).toBe(fnv32a(tenantId));
  });

  it("is deterministic", () => {
    expect(encodeTenantBind("my-tenant")).toBe(encodeTenantBind("my-tenant"));
  });

  it("produces different values for different tenant IDs", () => {
    expect(encodeTenantBind("tenant-1")).not.toBe(encodeTenantBind("tenant-2"));
  });

  it("returns a 32-bit unsigned integer", () => {
    const result = encodeTenantBind("some-tenant");
    expect(result).toBeGreaterThanOrEqual(0);
    expect(result).toBeLessThan(2 ** 32);
  });
});

// ---------------------------------------------------------------------------
// isTenantBindValid
// ---------------------------------------------------------------------------

describe("isTenantBindValid", () => {
  it("returns true when tenantBind matches the hash of tenantId", () => {
    const tenantId = "tenant-abc";
    const bind = fnv32a(tenantId);
    expect(isTenantBindValid(bind, tenantId)).toBe(true);
  });

  it("returns false when tenantBind does not match the hash of tenantId", () => {
    const tenantId = "tenant-abc";
    const wrongBind = fnv32a("tenant-xyz");
    expect(isTenantBindValid(wrongBind, tenantId)).toBe(false);
  });

  it("returns false for a completely wrong bind value", () => {
    expect(isTenantBindValid(0xdeadbeef, "tenant-abc")).toBe(false);
  });

  // Security-critical: legacy zero-bypass
  it("returns true when tenantBind is 0 (legacy unbound card bypass)", () => {
    expect(isTenantBindValid(0, "tenant-abc")).toBe(true);
    expect(isTenantBindValid(0, "any-tenant")).toBe(true);
    expect(isTenantBindValid(0, "")).toBe(true);
  });

  it("does NOT treat non-zero values as a bypass", () => {
    // Only 0 is the bypass; 1 should still be validated normally
    expect(isTenantBindValid(1, "tenant-abc")).toBe(false);
  });

  it("is consistent with encodeTenantBind", () => {
    const tenantId = "koperasi-maju";
    const bind = encodeTenantBind(tenantId);
    expect(isTenantBindValid(bind, tenantId)).toBe(true);
  });

  it("handles different tenant IDs correctly", () => {
    const t1 = "tenant-alpha";
    const t2 = "tenant-beta";
    const bind1 = fnv32a(t1);
    const bind2 = fnv32a(t2);

    expect(isTenantBindValid(bind1, t1)).toBe(true);
    expect(isTenantBindValid(bind2, t2)).toBe(true);
    // Cross-check: bind1 should NOT validate for t2
    expect(isTenantBindValid(bind1, t2)).toBe(false);
    expect(isTenantBindValid(bind2, t1)).toBe(false);
  });
});
