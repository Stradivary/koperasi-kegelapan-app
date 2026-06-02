// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import { createElement } from "react";

vi.mock("#/core/payload/types", () => ({
  CardStatus: {
    ACTIVE: 1,
    BLOCKED_TAMPER: 2,
    BLOCKED_FRAUD: 3,
    BLOCKED_EXPIRED: 4,
    BLOCKED_ADMIN: 5,
  },
}));

import { CardStatusBadge } from "../CardStatusBadge";

afterEach(() => {
  cleanup();
});

describe("CardStatusBadge", () => {
  it("renders 'Active' for ACTIVE status (1)", () => {
    render(createElement(CardStatusBadge, { status: 1 }));
    expect(screen.getByText("Active")).toBeDefined();
  });

  it("renders 'Tamper' for BLOCKED_TAMPER status (2)", () => {
    render(createElement(CardStatusBadge, { status: 2 }));
    expect(screen.getByText("Tamper")).toBeDefined();
  });

  it("renders 'Fraud' for BLOCKED_FRAUD status (3)", () => {
    render(createElement(CardStatusBadge, { status: 3 }));
    expect(screen.getByText("Fraud")).toBeDefined();
  });

  it("renders 'Expired' for BLOCKED_EXPIRED status (4)", () => {
    render(createElement(CardStatusBadge, { status: 4 }));
    expect(screen.getByText("Expired")).toBeDefined();
  });

  it("renders 'Blocked' for BLOCKED_ADMIN status (5)", () => {
    render(createElement(CardStatusBadge, { status: 5 }));
    expect(screen.getByText("Blocked")).toBeDefined();
  });

  it("renders fallback 'Status N' for unknown status", () => {
    render(createElement(CardStatusBadge, { status: 99 }));
    expect(screen.getByText("Status 99")).toBeDefined();
  });

  it("renders 'Blocked' when localBlockedReason is provided (overrides status)", () => {
    render(createElement(CardStatusBadge, { status: 1, localBlockedReason: "admin block" }));
    expect(screen.getByText("Blocked")).toBeDefined();
  });

  it("applies green classes for ACTIVE status", () => {
    render(createElement(CardStatusBadge, { status: 1 }));
    const badge = screen.getByText("Active");
    expect(badge.className).toContain("green");
  });

  it("applies red classes for BLOCKED_TAMPER status", () => {
    render(createElement(CardStatusBadge, { status: 2 }));
    const badge = screen.getByText("Tamper");
    expect(badge.className).toContain("red");
  });

  it("applies yellow classes for BLOCKED_EXPIRED status", () => {
    render(createElement(CardStatusBadge, { status: 4 }));
    const badge = screen.getByText("Expired");
    expect(badge.className).toContain("yellow");
  });
});
