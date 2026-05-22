/**
 * Shared Drizzle ORM mock helpers for server unit tests.
 *
 * Provides a reusable chainable select mock that mimics Drizzle's
 * query builder pattern: select → from → where → orderBy → limit → offset → get/all
 */

import { vi } from "vitest";

/**
 * Builds a chainable Drizzle select mock that resolves to `returnValue`.
 *
 * - `.get()` resolves to `returnValue`
 * - `.all()` resolves to `returnValue`
 * - All intermediate chain methods (from, where, orderBy, limit, offset) return `this`
 */
export function buildSelectChain(returnValue: unknown) {
  return {
    from: vi.fn().mockReturnThis(),
    where: vi.fn().mockReturnThis(),
    orderBy: vi.fn().mockReturnThis(),
    limit: vi.fn().mockReturnThis(),
    offset: vi.fn().mockReturnThis(),
    get: vi.fn().mockResolvedValue(returnValue),
    all: vi.fn().mockResolvedValue(returnValue),
  };
}
