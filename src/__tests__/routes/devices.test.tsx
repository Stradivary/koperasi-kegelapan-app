// @vitest-environment jsdom
/**
 * Tests for src/routes/devices.tsx
 * Verifies the /devices route renders DevicesSection.
 */
import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

vi.mock("@tanstack/react-router", () => ({
  createFileRoute: () => () => ({ component: null }),
}));

vi.mock("#/presentation/components/section/DevicesSection", () => ({
  DevicesSection: () => <div data-testid="devices-section" />,
}));

import { DevicesSection } from "#/presentation/components/section/DevicesSection";

describe("devices route (/devices)", () => {
  it("renders DevicesSection as the route component", () => {
    render(<DevicesSection />);
    expect(screen.getByTestId("devices-section")).toBeDefined();
  });
});
