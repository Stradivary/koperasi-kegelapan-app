import { describe, it, expect } from "vitest";
import {
  tenants,
  accounts,
  users,
  cards,
  sessionGrants,
  auditLog,
  devices,
  authSessions,
  transactionLog,
  syncCursors,
  cardEvents,
} from "./schema";

describe("schema", () => {
  it("exports tenants table", () => {
    expect(tenants).toBeDefined();
  });

  it("exports accounts table", () => {
    expect(accounts).toBeDefined();
  });

  it("exports users table", () => {
    expect(users).toBeDefined();
  });

  it("exports cards table", () => {
    expect(cards).toBeDefined();
  });

  it("exports sessionGrants table", () => {
    expect(sessionGrants).toBeDefined();
  });

  it("exports auditLog table", () => {
    expect(auditLog).toBeDefined();
  });

  it("exports devices table", () => {
    expect(devices).toBeDefined();
  });

  it("exports authSessions table", () => {
    expect(authSessions).toBeDefined();
  });

  it("exports transactionLog table", () => {
    expect(transactionLog).toBeDefined();
  });

  it("exports syncCursors table", () => {
    expect(syncCursors).toBeDefined();
  });

  it("exports cardEvents table", () => {
    expect(cardEvents).toBeDefined();
  });

  // Verify table structure
  it("tenants has expected columns", () => {
    const cols = Object.keys(tenants);
    expect(cols).toContain("tenantId");
    expect(cols).toContain("slug");
    expect(cols).toContain("name");
    expect(cols).toContain("status");
  });

  it("accounts has expected columns", () => {
    const cols = Object.keys(accounts);
    expect(cols).toContain("accountId");
    expect(cols).toContain("tenantId");
    expect(cols).toContain("username");
    expect(cols).toContain("role");
  });

  it("transactionLog has expected columns", () => {
    const cols = Object.keys(transactionLog);
    expect(cols).toContain("tenantId");
    expect(cols).toContain("cardId");
    expect(cols).toContain("type");
    expect(cols).toContain("amount");
    expect(cols).toContain("idempotencyKey");
  });

  it("devices has expected columns", () => {
    const cols = Object.keys(devices);
    expect(cols).toContain("deviceId");
    expect(cols).toContain("tenantId");
    expect(cols).toContain("blockedUntil");
  });
});
