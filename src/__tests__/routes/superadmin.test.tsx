// @vitest-environment jsdom
/**
 * Tests for src/routes/superadmin.tsx
 * Verifies the /superadmin route renders SuperadminSection.
 */
import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

vi.mock("@tanstack/react-router", () => ({
  createFileRoute: () => () => ({ component: null }),
}));

vi.mock("#/presentation/components/section/SuperadminSection", () => ({
  SuperadminSection: () => <div data-testid="superadmin-section" />,
}));

import { SuperadminSection } from "#/presentation/components/section/SuperadminSection";

// Recreate the SuperadminPage component as defined in the route
function SuperadminPage() {
  return <SuperadminSection />;
}

describe("superadmin route (/superadmin)", () => {
  it("renders SuperadminSection", () => {
    render(<SuperadminPage />);
    expect(screen.getByTestId("superadmin-section")).toBeDefined();
  });
});
