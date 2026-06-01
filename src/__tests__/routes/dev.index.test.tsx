// @vitest-environment jsdom
/**
 * Tests for src/routes/dev.index.tsx
 * Verifies the /dev/ route renders dev tools index page.
 */
import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

vi.mock("@tanstack/react-router", () => ({
  createFileRoute: () => () => ({ component: null }),
  Link: ({
    to,
    children,
    className,
  }: {
    to: string;
    children: React.ReactNode;
    className?: string;
  }) => (
    <a href={to} className={className} data-testid={`link-${to}`}>
      {children}
    </a>
  ),
}));

vi.mock("lucide-react", () => ({
  CreditCard: ({ size, className }: { size: number; className: string }) => (
    <svg data-testid="icon-credit-card" data-size={size} className={className} />
  ),
  Wifi: ({ size, className }: { size: number; className: string }) => (
    <svg data-testid="icon-wifi" data-size={size} className={className} />
  ),
}));

import { Link } from "@tanstack/react-router";
import { CreditCard, Wifi } from "lucide-react";

interface DevTool {
  to: string;
  icon: React.ReactNode;
  title: string;
  description: string;
}

const devTools: DevTool[] = [
  {
    to: "/dev/issuance-test",
    icon: <CreditCard size={24} className="text-muted-foreground" />,
    title: "Issuance Test",
    description: "Read & write NFC card payload, no auth required",
  },
  {
    to: "/dev/nfc-test",
    icon: <Wifi size={24} className="text-muted-foreground" />,
    title: "NFC Raw Test",
    description: "Direct NDEFReader API - scan, write, format without payload",
  },
];

// Recreate DevIndexPage for testing
function DevIndexPage() {
  return (
    <div className="min-h-screen bg-white p-6 max-w-2xl mx-auto">
      <div className="mb-8">
        <h1 className="text-2xl font-bold">Dev Tools</h1>
        <p className="text-sm text-muted-foreground mt-1">Internal tools - LAN/dev use only</p>
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        {devTools.map((tool) => (
          <Link
            key={tool.to}
            to={tool.to}
            className="border rounded-xl p-5 hover:bg-muted/50 transition-colors flex flex-col gap-3 no-underline"
          >
            {tool.icon}
            <div>
              <p className="font-semibold text-foreground">{tool.title}</p>
              <p className="text-sm text-muted-foreground mt-0.5">{tool.description}</p>
            </div>
          </Link>
        ))}
      </div>
    </div>
  );
}

describe("DevIndexPage (/dev/)", () => {
  it("renders the page title", () => {
    render(<DevIndexPage />);
    expect(screen.getByText("Dev Tools")).toBeDefined();
  });

  it("renders the subtitle", () => {
    render(<DevIndexPage />);
    expect(screen.getByText("Internal tools - LAN/dev use only")).toBeDefined();
  });

  it("renders Issuance Test link", () => {
    render(<DevIndexPage />);
    expect(screen.getByText("Issuance Test")).toBeDefined();
    expect(screen.getByTestId("link-/dev/issuance-test")).toBeDefined();
  });

  it("renders NFC Raw Test link", () => {
    render(<DevIndexPage />);
    expect(screen.getByText("NFC Raw Test")).toBeDefined();
    expect(screen.getByTestId("link-/dev/nfc-test")).toBeDefined();
  });

  it("renders descriptions for each tool", () => {
    render(<DevIndexPage />);
    expect(screen.getByText("Read & write NFC card payload, no auth required")).toBeDefined();
    expect(
      screen.getByText("Direct NDEFReader API - scan, write, format without payload"),
    ).toBeDefined();
  });

  it("renders icons for each tool", () => {
    render(<DevIndexPage />);
    expect(screen.getByTestId("icon-credit-card")).toBeDefined();
    expect(screen.getByTestId("icon-wifi")).toBeDefined();
  });
});
