// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import { createElement } from "react";

vi.mock("#/presentation/lib/utils", () => ({
  cn: (...args: unknown[]) => args.filter(Boolean).join(" "),
}));

vi.mock("#/core/nfc/stateMachine.ts", () => ({}));

import { StepIndicator } from "../StepIndicator";

afterEach(() => {
  cleanup();
});

describe("StepIndicator", () => {
  it("renders 4 steps by default", () => {
    render(createElement(StepIndicator, { phase: "idle" }));
    // Default labels
    expect(screen.getByText("Tap Kartu")).toBeDefined();
    expect(screen.getByText("Kartu Ditemukan")).toBeDefined();
    expect(screen.getByText("Tulis Kartu")).toBeDefined();
    expect(screen.getByText("Selesai")).toBeDefined();
  });

  it("renders custom labels when provided", () => {
    render(
      createElement(StepIndicator, {
        phase: "idle",
        labels: {
          step1: "Step 1",
          step2: "Step 2",
          step3: "Step 3",
          step4: "Step 4",
        },
      }),
    );
    expect(screen.getByText("Step 1")).toBeDefined();
    expect(screen.getByText("Step 2")).toBeDefined();
    expect(screen.getByText("Step 3")).toBeDefined();
    expect(screen.getByText("Step 4")).toBeDefined();
  });

  it("marks step 1 as current during idle phase", () => {
    render(createElement(StepIndicator, { phase: "idle" }));
    const step1 = screen.getByText("1");
    expect(step1.closest("[aria-current='step']")).toBeTruthy();
  });

  it("marks step 1 as current during scanning phase", () => {
    render(createElement(StepIndicator, { phase: "scanning" }));
    const step1 = screen.getByText("1");
    expect(step1.closest("[aria-current='step']")).toBeTruthy();
  });

  it("marks step 2 as current during ready phase", () => {
    render(createElement(StepIndicator, { phase: "ready" }));
    const step2 = screen.getByText("2");
    expect(step2.closest("[aria-current='step']")).toBeTruthy();
  });

  it("marks step 3 as current during writing phase", () => {
    render(createElement(StepIndicator, { phase: "writing" }));
    const step3 = screen.getByText("3");
    expect(step3.closest("[aria-current='step']")).toBeTruthy();
  });

  it("marks step 4 as current during success phase", () => {
    render(createElement(StepIndicator, { phase: "success" }));
    // Step 4 is active - all previous steps show checkmarks
    const step4 = screen.getByText("4");
    expect(step4.closest("[aria-current='step']")).toBeTruthy();
  });

  it("shows checkmarks for completed steps", () => {
    render(createElement(StepIndicator, { phase: "writing" }));
    // Steps 1 and 2 should be completed (show checkmarks via Check icon)
    // Step 3 is current, step 4 is pending
    // We check that step numbers 1 and 2 are NOT shown (replaced by checkmarks)
    expect(screen.queryByText("1")).toBeNull();
    expect(screen.queryByText("2")).toBeNull();
    expect(screen.getByText("3")).toBeDefined(); // current
    expect(screen.getByText("4")).toBeDefined(); // pending
  });

  it("renders a nav element with aria-label", () => {
    const { container } = render(createElement(StepIndicator, { phase: "idle" }));
    const nav = container.querySelector("nav");
    expect(nav).toBeTruthy();
    expect(nav?.getAttribute("aria-label")).toBe("Langkah operasi NFC");
  });

  it("handles error phase without crashing (no step is current)", () => {
    expect(() => {
      render(createElement(StepIndicator, { phase: "error" }));
    }).not.toThrow();
  });

  it("handles classifying phase (step 2 active)", () => {
    render(createElement(StepIndicator, { phase: "classifying" }));
    const step2 = screen.getByText("2");
    expect(step2.closest("[aria-current='step']")).toBeTruthy();
  });

  it("handles validating phase (step 2 active)", () => {
    render(createElement(StepIndicator, { phase: "validating" }));
    const step2 = screen.getByText("2");
    expect(step2.closest("[aria-current='step']")).toBeTruthy();
  });
});
