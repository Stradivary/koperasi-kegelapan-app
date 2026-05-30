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
 * - `.get()` and `.all()` resolve to `returnValue`
 * - All intermediate chain methods (from, where, orderBy, limit, offset) return `this`
 * - The chain is awaitable so `await db.select().from().where().orderBy().limit(n)`
 *   resolves to `returnValue` without needing an explicit `.all()` call.
 *
 * The `then` property makes the chain PromiseLike. The no-thenable lint rule is
 * suppressed here because this is intentional test infrastructure, not production code.
 */
export function buildSelectChain(returnValue: unknown) {
  const chain = {
    from: vi.fn().mockReturnThis(),
    where: vi.fn().mockReturnThis(),
    orderBy: vi.fn().mockReturnThis(),
    limit: vi.fn().mockReturnThis(),
    offset: vi.fn().mockReturnThis(),
    get: vi.fn().mockResolvedValue(returnValue),
    all: vi.fn().mockResolvedValue(returnValue),
    // eslint-disable-next-line unicorn/no-thenable
    then(onFulfilled: (v: unknown) => unknown, onRejected: (e: unknown) => unknown) {
      return Promise.resolve(returnValue).then(onFulfilled, onRejected);
    },
  };
  return chain;
}
