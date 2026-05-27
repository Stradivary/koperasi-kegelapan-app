// @vitest-environment node
import { describe, it, expect } from "vitest";
import { issueSessionGrant } from "../sessionGrant";

const MASTER_KEY = Buffer.from("test-master-key-32-bytes-padding!!", "utf8").slice(0, 32);

describe("issueSessionGrant", () => {
  it("returns a grant with all required fields", () => {
    const grant = issueSessionGrant(MASTER_KEY, "tenant-1", "account-1", "device-1", "admin");
    expect(grant.keyVersion).toBe(1);
    expect(typeof grant.sessionKey).toBe("string");
    expect(typeof grant.expiresAt).toBe("number");
    expect(Array.isArray(grant.allowedOps)).toBe(true);
    expect(grant.tenantId).toBe("tenant-1");
    expect(grant.accountId).toBe("account-1");
    expect(grant.deviceId).toBe("device-1");
    expect(typeof grant.signature).toBe("string");
  });

  it("expiresAt is approximately 24 hours from now", () => {
    const before = Math.floor(Date.now() / 1000);
    const grant = issueSessionGrant(MASTER_KEY, "tenant-1", "account-1", "device-1", "admin");
    const after = Math.floor(Date.now() / 1000);
    const expectedExpiry = before + 24 * 60 * 60;
    expect(grant.expiresAt).toBeGreaterThanOrEqual(expectedExpiry - 2);
    expect(grant.expiresAt).toBeLessThanOrEqual(after + 24 * 60 * 60 + 2);
  });

  it("allowedOps matches roleToOps for admin role", () => {
    const grant = issueSessionGrant(MASTER_KEY, "tenant-1", "account-1", "device-1", "admin");
    expect(grant.allowedOps).toContain("read");
    expect(grant.allowedOps).toContain("debit");
    expect(grant.allowedOps).toContain("credit");
    expect(grant.allowedOps).toContain("admin");
  });

  it("allowedOps matches roleToOps for gate role", () => {
    const grant = issueSessionGrant(MASTER_KEY, "tenant-1", "account-1", "device-1", "gate");
    expect(grant.allowedOps).toEqual(["read", "checkin"]);
  });

  it("allowedOps matches roleToOps for scout role", () => {
    const grant = issueSessionGrant(MASTER_KEY, "tenant-1", "account-1", "device-1", "scout");
    expect(grant.allowedOps).toEqual(["read"]);
  });

  it("uses provided keyVersion", () => {
    const grant = issueSessionGrant(MASTER_KEY, "tenant-1", "account-1", "device-1", "admin", 3);
    expect(grant.keyVersion).toBe(3);
  });

  it("defaults keyVersion to 1 when not provided", () => {
    const grant = issueSessionGrant(MASTER_KEY, "tenant-1", "account-1", "device-1", "admin");
    expect(grant.keyVersion).toBe(1);
  });

  it("produces different sessionKeys for different tenants", () => {
    const g1 = issueSessionGrant(MASTER_KEY, "tenant-1", "account-1", "device-1", "admin");
    const g2 = issueSessionGrant(MASTER_KEY, "tenant-2", "account-1", "device-1", "admin");
    expect(g1.sessionKey).not.toBe(g2.sessionKey);
  });

  it("produces same sessionKey for same tenant (deterministic)", () => {
    const g1 = issueSessionGrant(MASTER_KEY, "tenant-1", "account-1", "device-1", "admin");
    const g2 = issueSessionGrant(MASTER_KEY, "tenant-1", "account-1", "device-1", "admin");
    expect(g1.sessionKey).toBe(g2.sessionKey);
  });

  it("produces different signatures for different accountIds", () => {
    const g1 = issueSessionGrant(MASTER_KEY, "tenant-1", "account-1", "device-1", "admin");
    const g2 = issueSessionGrant(MASTER_KEY, "tenant-1", "account-2", "device-1", "admin");
    expect(g1.signature).not.toBe(g2.signature);
  });

  it("signature is a base64url string", () => {
    const grant = issueSessionGrant(MASTER_KEY, "tenant-1", "account-1", "device-1", "admin");
    expect(grant.signature).toMatch(/^[A-Za-z0-9_-]+$/);
  });

  it("sessionKey is a base64 string", () => {
    const grant = issueSessionGrant(MASTER_KEY, "tenant-1", "account-1", "device-1", "admin");
    // base64 chars
    expect(grant.sessionKey).toMatch(/^[A-Za-z0-9+/=]+$/);
  });
});
