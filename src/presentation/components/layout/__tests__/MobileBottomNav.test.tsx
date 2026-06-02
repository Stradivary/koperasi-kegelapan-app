// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { createElement } from "react";

import { MobileBottomNav } from "../MobileBottomNav";

const IconA = () => <span data-testid="icon-a" />;
const IconB = () => <span data-testid="icon-b" />;
const IconC = () => <span data-testid="icon-c" />;

const items = [
  { id: "home" as const, icon: IconA, label: "Home" },
  { id: "cards" as const, icon: IconB, label: "Cards" },
  { id: "settings" as const, icon: IconC, label: "Settings", cta: true },
];

afterEach(() => {
  cleanup();
});

describe("MobileBottomNav", () => {
  it("renders all nav items", () => {
    render(createElement(MobileBottomNav, { items, activeId: "home", onSelect: vi.fn() }));
    expect(screen.getByText("Home")).toBeDefined();
    expect(screen.getByText("Cards")).toBeDefined();
    expect(screen.getByText("Settings")).toBeDefined();
  });

  it("calls onSelect with the correct id when a button is clicked", async () => {
    const onSelect = vi.fn();
    render(createElement(MobileBottomNav, { items, activeId: "home", onSelect }));
    await userEvent.click(screen.getByText("Cards"));
    expect(onSelect).toHaveBeenCalledWith("cards");
  });

  it("applies active styling to the active item", () => {
    render(createElement(MobileBottomNav, { items, activeId: "home", onSelect: vi.fn() }));
    const homeBtn = screen.getByText("Home").closest("button")!;
    expect(homeBtn.className).toContain("text-brand");
  });

  it("applies inactive styling to non-active items", () => {
    render(createElement(MobileBottomNav, { items, activeId: "home", onSelect: vi.fn() }));
    const cardsBtn = screen.getByText("Cards").closest("button")!;
    expect(cardsBtn.className).toContain("text-muted-foreground");
  });

  it("renders CTA item with special styling", () => {
    render(createElement(MobileBottomNav, { items, activeId: "home", onSelect: vi.fn() }));
    const settingsBtn = screen.getByText("Settings").closest("button")!;
    // CTA items have text-brand class
    expect(settingsBtn.className).toContain("text-brand");
  });

  it("calls onSelect for CTA item when clicked", async () => {
    const onSelect = vi.fn();
    render(createElement(MobileBottomNav, { items, activeId: "home", onSelect }));
    await userEvent.click(screen.getByText("Settings"));
    expect(onSelect).toHaveBeenCalledWith("settings");
  });

  it("renders a nav element", () => {
    const { container } = render(
      createElement(MobileBottomNav, { items, activeId: "home", onSelect: vi.fn() }),
    );
    expect(container.querySelector("nav")).toBeTruthy();
  });
});
