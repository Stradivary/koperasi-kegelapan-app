/**
 * Global test setup for Vitest.
 *
 * - Enables React's act() environment so React 19's concurrent scheduler
 *   flushes synchronously inside tests, preventing "window is not defined"
 *   errors from async scheduler callbacks leaking across test boundaries.
 * - Registers @testing-library/react auto-cleanup after each test.
 */
import { afterEach } from "vitest";
import { cleanup } from "@testing-library/react";

// Tell React 19 that we're in a test environment so act() works correctly
// and the scheduler doesn't fire setImmediate callbacks outside test scope.
// @ts-expect-error - IS_REACT_ACT_ENVIRONMENT is a React internal global
globalThis.IS_REACT_ACT_ENVIRONMENT = true;

// Auto-cleanup rendered components after each test to prevent state leakage
afterEach(() => {
  cleanup();
});
