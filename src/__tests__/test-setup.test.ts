// @vitest-environment jsdom
/**
 * Tests for src/test-setup.ts
 * Verifies the test setup file configures the environment correctly.
 */
import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import { createElement } from "react";

describe("test-setup", () => {
  it("sets IS_REACT_ACT_ENVIRONMENT to true", () => {
    // The test-setup.ts is loaded via vitest setupFiles, so this should already be set
    // @ts-expect-error - IS_REACT_ACT_ENVIRONMENT is a React internal global
    expect(globalThis.IS_REACT_ACT_ENVIRONMENT).toBe(true);
  });

  it("auto-cleanup works between tests (render in this test)", () => {
    render(createElement("div", { "data-testid": "setup-test-element" }, "hello"));
    expect(screen.getByTestId("setup-test-element")).toBeDefined();
  });

  it("auto-cleanup works between tests (element from previous test is gone)", () => {
    expect(screen.queryByTestId("setup-test-element")).toBeNull();
  });
});
