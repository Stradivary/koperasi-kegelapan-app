// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import { createElement } from "react";

vi.mock("../../ui/spinner", () => ({
  Spinner: ({ size, className }: { size?: string; className?: string }) => (
    <span data-testid="spinner" data-size={size} className={className} />
  ),
}));

import { LoadingState } from "../LoadingState";

afterEach(() => {
  cleanup();
});

describe("LoadingState", () => {
  it("renders default text 'Memuat...' when no text prop", () => {
    render(createElement(LoadingState, {}));
    expect(screen.getByText("Memuat...")).toBeDefined();
  });

  it("renders custom text when provided", () => {
    render(createElement(LoadingState, { text: "Loading data..." }));
    expect(screen.getByText("Loading data...")).toBeDefined();
  });

  it("renders section variant by default", () => {
    const { container } = render(createElement(LoadingState, {}));
    expect(container.querySelector(".py-8")).toBeTruthy();
  });

  it("renders page variant with min-h-screen", () => {
    const { container } = render(createElement(LoadingState, { variant: "page" }));
    expect(container.querySelector(".min-h-screen")).toBeTruthy();
  });

  it("renders button variant as inline span", () => {
    const { container } = render(createElement(LoadingState, { variant: "button" }));
    expect(container.querySelector("span.inline-flex")).toBeTruthy();
  });

  it("renders inline variant as span", () => {
    const { container } = render(createElement(LoadingState, { variant: "inline" }));
    expect(container.querySelector("span.inline-flex")).toBeTruthy();
  });

  it("renders a spinner in all variants", () => {
    const variants = ["page", "section", "button", "inline"] as const;
    for (const variant of variants) {
      const { unmount } = render(createElement(LoadingState, { variant }));
      expect(screen.getAllByTestId("spinner").length).toBeGreaterThan(0);
      unmount();
      cleanup();
    }
  });

  it("applies custom className", () => {
    const { container } = render(createElement(LoadingState, { className: "my-custom-class" }));
    expect(container.querySelector(".my-custom-class")).toBeTruthy();
  });
});
