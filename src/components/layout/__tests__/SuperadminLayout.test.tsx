// @vitest-environment jsdom
/**
 * Tests for SuperadminLayout.tsx
 * Covers: rendering, navigation, mobile drawer, logout
 */
import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mockNavigate = vi.fn();
vi.mock("@tanstack/react-router", () => ({ useNavigate: () => mockNavigate }));
vi.mock("#/lib/utils/brand", () => ({ BRAND: { APP_NAME: "TestApp", BYLINE: "Test" } }));
vi.mock("#/components/ui/button", () => ({
  Button: ({ children, onClick }: { children: React.ReactNode; onClick?: () => void }) => (
    <button onClick={onClick}>{children}</button>
  ),
}));
vi.mock("#/components/ui/sheet", () => ({
  Sheet: ({ children, open }: { children: React.ReactNode; open: boolean }) =>
    open ? <div data-testid="sheet">{children}</div> : null,
  SheetContent: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  SheetHeader: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  SheetTitle: ({ children }: { children: React.ReactNode }) => <h2>{children}</h2>,
}));
vi.mock("../MobileBottomNav", () => ({
  MobileBottomNav: ({
    items,
    activeId,
    onSelect,
  }: {
    items: { id: string; label: string }[];
    activeId: string;
    onSelect: (id: string) => void;
  }) => (
    <nav data-testid="mobile-bottom-nav">
      {items.map((item) => (
        <button key={item.id} data-active={activeId === item.id} onClick={() => onSelect(item.id)}>
          {item.label}
        </button>
      ))}
    </nav>
  ),
}));
vi.mock("lucide-react", () => ({
  Building2: () => <span />,
  Leaf: () => <span />,
  LogOut: () => <span />,
  Menu: () => <span data-testid="menu-icon" />,
  Users: () => <span />,
}));

import { SuperadminLayout } from "../SuperadminLayout";

const defaultProps = {
  activeSection: "tenants" as const,
  onSectionChange: vi.fn(),
  children: <div data-testid="content">Content</div>,
};

beforeEach(() => {
  vi.clearAllMocks();
});
afterEach(() => {
  cleanup();
});

describe("SuperadminLayout - rendering", () => {
  it("renders children", () => {
    render(<SuperadminLayout {...defaultProps} />);
    expect(screen.getByTestId("content")).toBeDefined();
  });

  it("renders active section label in mobile header", () => {
    render(<SuperadminLayout {...defaultProps} activeSection="tenants" />);
    // Use getAllByText since it appears in sidebar + header + bottom nav
    const elements = screen.getAllByText("Tenants");
    expect(elements.length).toBeGreaterThan(0);
  });

  it("renders Superadmin badge", () => {
    render(<SuperadminLayout {...defaultProps} />);
    const badges = screen.getAllByText("Superadmin");
    expect(badges.length).toBeGreaterThan(0);
  });

  it("renders mobile bottom nav", () => {
    render(<SuperadminLayout {...defaultProps} />);
    expect(screen.getByTestId("mobile-bottom-nav")).toBeDefined();
  });

  it("renders app name in sidebar", () => {
    render(<SuperadminLayout {...defaultProps} />);
    const appNames = screen.getAllByText("TestApp");
    expect(appNames.length).toBeGreaterThan(0);
  });
});

describe("SuperadminLayout - navigation", () => {
  it("calls onSectionChange when bottom nav item clicked", async () => {
    render(<SuperadminLayout {...defaultProps} />);
    // Use the mobile bottom nav mock which has unique buttons
    const nav = screen.getByTestId("mobile-bottom-nav");
    const accountsBtn = nav.querySelector("button:last-child") as HTMLButtonElement;
    await userEvent.click(accountsBtn);
    expect(defaultProps.onSectionChange).toHaveBeenCalledWith("accounts");
  });

  it("shows correct active section label for accounts", () => {
    render(<SuperadminLayout {...defaultProps} activeSection="accounts" />);
    const elements = screen.getAllByText("Accounts");
    expect(elements.length).toBeGreaterThan(0);
  });
});

describe("SuperadminLayout - mobile drawer", () => {
  it("opens drawer when menu button clicked", async () => {
    render(<SuperadminLayout {...defaultProps} />);
    const menuBtn = screen.getByTestId("menu-icon").closest("button")!;
    await userEvent.click(menuBtn);
    expect(screen.getByTestId("sheet")).toBeDefined();
  });

  it("calls onSectionChange from drawer nav", async () => {
    render(<SuperadminLayout {...defaultProps} />);
    const menuBtn = screen.getByTestId("menu-icon").closest("button")!;
    await userEvent.click(menuBtn);
    // In the sheet, click the last Accounts button
    const sheet = screen.getByTestId("sheet");
    const btns = sheet.querySelectorAll("button");
    const accountsBtn = Array.from(btns).find((b) => b.textContent?.includes("Accounts"));
    if (accountsBtn) await userEvent.click(accountsBtn);
    expect(defaultProps.onSectionChange).toHaveBeenCalledWith("accounts");
  });
});

describe("SuperadminLayout - logout", () => {
  it("navigates to / when Logout clicked in sidebar", async () => {
    render(<SuperadminLayout {...defaultProps} />);
    const logoutBtns = screen.getAllByText("Logout");
    await userEvent.click(logoutBtns[0]);
    expect(mockNavigate).toHaveBeenCalledWith({ to: "/" });
  });
});
