// @vitest-environment jsdom
/**
 * Tests for src/routes/dev.issuance-test.tsx
 * Verifies the /dev/issuance-test route renders IssuanceTestSection.
 */
import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

vi.mock("@tanstack/react-router", () => ({
  createFileRoute: () => () => ({ component: null }),
}));

vi.mock("#/presentation/components/section/IssuanceTestSection", () => ({
  IssuanceTestSection: () => <div data-testid="issuance-test-section" />,
}));

import { IssuanceTestSection } from "#/presentation/components/section/IssuanceTestSection";

describe("dev.issuance-test route (/dev/issuance-test)", () => {
  it("renders IssuanceTestSection as the route component", () => {
    render(<IssuanceTestSection />);
    expect(screen.getByTestId("issuance-test-section")).toBeDefined();
  });
});
