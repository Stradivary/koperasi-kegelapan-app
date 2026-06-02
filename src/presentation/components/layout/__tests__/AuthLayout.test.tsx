// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";

vi.mock("#/presentation/lib/brand", () => ({
  BRAND: { APP_NAME: "TestApp", BYLINE: "Test Byline" },
}));

import { AuthLayout } from "../AuthLayout";

afterEach(() => {
  cleanup();
});

describe("AuthLayout", () => {
  it("renders the app name from BRAND", () => {
    render(
      <AuthLayout>
        <div>content</div>
      </AuthLayout>,
    );
    expect(screen.getByText("TestApp")).toBeDefined();
  });

  it("renders default headerSubtitle from BRAND.BYLINE", () => {
    render(
      <AuthLayout>
        <div>content</div>
      </AuthLayout>,
    );
    expect(screen.getByText("Test Byline")).toBeDefined();
  });

  it("renders custom headerSubtitle when provided", () => {
    render(
      <AuthLayout headerSubtitle="Custom Subtitle">
        <div>content</div>
      </AuthLayout>,
    );
    expect(screen.getByText("Custom Subtitle")).toBeDefined();
  });

  it("renders children", () => {
    render(
      <AuthLayout>
        <div data-testid="child">Hello</div>
      </AuthLayout>,
    );
    expect(screen.getByTestId("child")).toBeDefined();
  });

  it("applies brand-dark header background for brand-dark variant", () => {
    const { container } = render(
      <AuthLayout variant="brand-dark">
        <div>content</div>
      </AuthLayout>,
    );
    expect(container.querySelector(".bg-brand-dark")).toBeTruthy();
  });

  it("applies brand header background for brand variant (default)", () => {
    const { container } = render(
      <AuthLayout>
        <div>content</div>
      </AuthLayout>,
    );
    expect(container.querySelector(".bg-brand")).toBeTruthy();
  });

  it("applies items-center for center align (default)", () => {
    const { container } = render(
      <AuthLayout>
        <div>content</div>
      </AuthLayout>,
    );
    expect(container.querySelector(".items-center")).toBeTruthy();
  });

  it("applies items-start for top align", () => {
    const { container } = render(
      <AuthLayout align="top">
        <div>content</div>
      </AuthLayout>,
    );
    expect(container.querySelector(".items-start")).toBeTruthy();
  });

  it("renders min-h-screen wrapper", () => {
    const { container } = render(
      <AuthLayout>
        <div>content</div>
      </AuthLayout>,
    );
    expect(container.querySelector(".min-h-screen")).toBeTruthy();
  });
});
