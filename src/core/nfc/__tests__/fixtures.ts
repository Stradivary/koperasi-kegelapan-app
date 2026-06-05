/**
 * Shared test fixtures for NFC and card-related unit tests.
 *
 * Provides factory functions for Card and User records used across
 * localStatusCheck, blockEnforcer, and property-based tests.
 */

import type { Card, User } from "#/infrastructure/persistence/dexie/localDb";

/**
 * Creates a full Card record with sensible defaults.
 * Override any field via the `overrides` parameter.
 */
export function makeCard(overrides: Partial<Card> = {}): Card {
  return {
    tenantId: "tenant-1",
    cardId: "04a2b3c4d5e6f7",
    userId: null,
    status: "active",
    balance: 50000,
    counter: 5,
    keyVersion: 1,
    createdAt: 1700000000,
    lastActivityAt: 1700001000,
    expiresAt: null,
    notes: null,
    ...overrides,
  };
}

/**
 * Creates a minimal Card stub - only status is set, all other fields zeroed.
 * Useful for block-check tests that only care about the status field.
 */
export function stubCard(status: Card["status"]): Card {
  return {
    tenantId: "t1",
    cardId: "c1",
    userId: null,
    status,
    balance: 0,
    counter: 0,
    keyVersion: 1,
    createdAt: 0,
    lastActivityAt: null,
    expiresAt: null,
    notes: null,
  };
}

/**
 * Creates a full User record with sensible defaults.
 * Override any field via the `overrides` parameter.
 */
export function makeUser(overrides: Partial<User> = {}): User {
  return {
    tenantId: "tenant-1",
    userId: "user-abc",
    name: "Test User",
    status: "active",
    createdAt: 1700000000,
    updatedAt: 1700000000,
    ...overrides,
  };
}

/**
 * All blocked card statuses, for use in parameterized tests.
 */
export const BLOCKED_CARD_STATUSES: Card["status"][] = [
  "blocked_tamper",
  "blocked_fraud",
  "blocked_expired",
  "blocked_admin",
];
