// @vitest-environment jsdom
/**
 * Tests for src/routes/index.tsx
 * Verifies the root "/" route renders LoginSection.
 */
import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

vi.mock("@tanstack/react-router", () => ({
  createFileRoute: () => () => ({ component: null }),
}));

vi.mock("#/presentation/components/section/LoginSection", () => ({
  LoginSection: () => <div data-testid="login-section" />,
}));

import { LoginSection } from "#/presentation/components/section/LoginSection";

describe("index route (/)", () => {
  it("renders LoginSection as the route component", () => {
    render(<LoginSection />);
    expect(screen.getByTestId("login-section")).toBeDefined();
  });
});
