// @vitest-environment jsdom
import { describe, it, expect } from "vitest";
import { roleToOps } from "../roleOps";

describe("roleToOps", () => {
  it("returns read+debit+checkout for terminal", () => {
    expect(roleToOps("terminal")).toEqual(["read", "debit", "checkout"]);
  });

  it("returns read+checkin for gate", () => {
    expect(roleToOps("gate")).toEqual(["read", "checkin"]);
  });

  it("returns read only for scout", () => {
    expect(roleToOps("scout")).toEqual(["read"]);
  });

  it("returns read only for kiosk (removed role, falls to default)", () => {
    expect(roleToOps("kiosk")).toEqual(["read"]);
  });

  it("returns full ops for station", () => {
    expect(roleToOps("station")).toEqual(["read", "credit", "checkin", "checkout", "admin"]);
  });

  it("returns all ops for admin", () => {
    expect(roleToOps("admin")).toEqual([
      "read",
      "debit",
      "credit",
      "checkin",
      "checkout",
      "admin",
      "station",
    ]);
  });

  it("returns read only for unknown role", () => {
    expect(roleToOps("unknown")).toEqual(["read"]);
  });

  it("returns read only for empty string", () => {
    expect(roleToOps("")).toEqual(["read"]);
  });

  it("returns read only for superadmin (not in switch)", () => {
    expect(roleToOps("superadmin")).toEqual(["read"]);
  });
});
