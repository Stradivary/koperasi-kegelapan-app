// @vitest-environment jsdom
/**
 * Tests for src/presentation/providers/root-provider.tsx
 *
 * Covers:
 * - getContext() returns a properly configured QueryClient
 * - QueryClient default options (networkMode, staleTime, gcTime, retry)
 * - TanstackQueryProvider renders children
 * - TanstackQueryProvider renders null when no children provided
 */
import { describe, it, expect } from "vitest";
import { render } from "@testing-library/react";

import TanstackQueryProvider, { getContext } from "#/presentation/providers/root-provider";

describe("getContext", () => {
  it("returns an object with a queryClient", () => {
    const ctx = getContext();
    expect(ctx).toHaveProperty("queryClient");
    expect(ctx.queryClient).toBeDefined();
  });

  it("configures queries with networkMode 'always'", () => {
    const ctx = getContext();
    const defaults = ctx.queryClient.getDefaultOptions();
    expect(defaults.queries?.networkMode).toBe("always");
  });

  it("configures queries with staleTime of 5 minutes", () => {
    const ctx = getContext();
    const defaults = ctx.queryClient.getDefaultOptions();
    expect(defaults.queries?.staleTime).toBe(1000 * 60 * 5);
  });

  it("configures queries with gcTime of 24 hours", () => {
    const ctx = getContext();
    const defaults = ctx.queryClient.getDefaultOptions();
    expect(defaults.queries?.gcTime).toBe(1000 * 60 * 60 * 24);
  });

  it("configures queries with retry disabled", () => {
    const ctx = getContext();
    const defaults = ctx.queryClient.getDefaultOptions();
    expect(defaults.queries?.retry).toBe(false);
  });

  it("configures mutations with networkMode 'always'", () => {
    const ctx = getContext();
    const defaults = ctx.queryClient.getDefaultOptions();
    expect(defaults.mutations?.networkMode).toBe("always");
  });

  it("configures mutations with retry disabled", () => {
    const ctx = getContext();
    const defaults = ctx.queryClient.getDefaultOptions();
    expect(defaults.mutations?.retry).toBe(false);
  });
});

describe("TanstackQueryProvider", () => {
  it("renders children when provided", () => {
    const { getByText } = render(
      <TanstackQueryProvider>
        <span>hello</span>
      </TanstackQueryProvider>,
    );
    expect(getByText("hello")).toBeDefined();
  });

  it("renders null when no children provided", () => {
    const { container } = render(<TanstackQueryProvider />);
    expect(container.innerHTML).toBe("");
  });
});
