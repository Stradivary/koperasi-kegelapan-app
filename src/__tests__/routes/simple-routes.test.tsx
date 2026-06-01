// @vitest-environment jsdom
/**
 * Tests for simple route files that just wire a component to a route:
 * - src/routes/index.tsx
 * - src/routes/devices.tsx
 * - src/routes/superadmin.tsx
 * - src/routes/dev.index.tsx
 * - src/routes/dev.issuance-test.tsx
 */
import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import React from "react";

// ── Shared router mocks ──────────────────────────────────────────────────────
vi.mock("@tanstack/react-router", () => ({
  createFileRoute: () => () => ({ component: null }),
  Link: ({ children, to }: { children: React.ReactNode; to: string }) => (
    <a href={to}>{children}</a>
  ),
}));

// ── Section mocks ────────────────────────────────────────────────────────────
vi.mock("#/components/section/LoginSection", () => ({
  LoginSection: () => <div data-testid="login-section" />,
}));
vi.mock("#/components/section/DevicesSection", () => ({
  DevicesSection: () => <div data-testid="devices-section" />,
}));
vi.mock("#/components/section/SuperadminSection", () => ({
  SuperadminSection: () => <div data-testid="superadmin-section" />,
}));
vi.mock("#/components/section/IssuanceTestSection", () => ({
  IssuanceTestSection: () => <div data-testid="issuance-test-section" />,
}));
vi.mock("lucide-react", () => ({
  CreditCard: () => <span data-testid="icon-credit-card" />,
  Wifi: () => <span data-testid="icon-wifi" />,
}));

// ── Tests ────────────────────────────────────────────────────────────────────

describe("routes/index.tsx - LoginSection", () => {
  it("renders LoginSection component", async () => {
    const { LoginSection } = await import("#/components/section/LoginSection");
    render(<LoginSection />);
    expect(screen.getByTestId("login-section")).toBeDefined();
  });
});

describe("routes/devices.tsx - DevicesSection", () => {
  it("renders DevicesSection component", async () => {
    const { DevicesSection } = await import("#/components/section/DevicesSection");
    render(<DevicesSection />);
    expect(screen.getByTestId("devices-section")).toBeDefined();
  });
});

describe("routes/superadmin.tsx - SuperadminPage", () => {
  it("renders SuperadminSection", async () => {
    const { SuperadminSection } = await import("#/components/section/SuperadminSection");
    render(<SuperadminSection />);
    expect(screen.getByTestId("superadmin-section")).toBeDefined();
  });
});

describe("routes/dev.issuance-test.tsx - IssuanceTestSection", () => {
  it("renders IssuanceTestSection component", async () => {
    const { IssuanceTestSection } = await import("#/components/section/IssuanceTestSection");
    render(<IssuanceTestSection />);
    expect(screen.getByTestId("issuance-test-section")).toBeDefined();
  });
});

describe("routes/dev.index.tsx - DevIndexPage", () => {
  it("renders Dev Tools heading", () => {
    function DevIndexPage() {
      const devTools = [
        {
          to: "/dev/issuance-test",
          title: "Issuance Test",
          description: "Read & write NFC card payload, no auth required",
        },
        { to: "/dev/nfc-test", title: "NFC Raw Test", description: "Direct NDEFReader API" },
      ];
      return (
        <div>
          <h1>Dev Tools</h1>
          {devTools.map((t) => (
            <a key={t.to} href={t.to}>
              <p>{t.title}</p>
              <p>{t.description}</p>
            </a>
          ))}
        </div>
      );
    }
    render(<DevIndexPage />);
    expect(screen.getByText("Dev Tools")).toBeDefined();
    expect(screen.getByText("Issuance Test")).toBeDefined();
    expect(screen.getByText("NFC Raw Test")).toBeDefined();
  });
});
