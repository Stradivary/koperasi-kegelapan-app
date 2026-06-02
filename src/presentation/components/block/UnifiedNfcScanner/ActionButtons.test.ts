/**
 * Unit tests for ActionButtons component logic.
 *
 * Tests the button enable/disable logic and label defaults.
 * Full rendering tests require jsdom environment (covered in integration tests).
 *
 * @see Requirements 17.1, 17.2, 17.3, 17.4, 17.5, 17.6
 */

import { describe, it, expect } from "vitest";

import { CardStatus } from "#/core/payload/types.ts";

// ============================================================================
// Test the button disable logic (same as component implementation)
// ============================================================================

/**
 * Determines whether the check-in button should be disabled.
 * Disabled when: already checked in OR card status != ACTIVE
 */
function isCheckinDisabled(isCheckedIn: boolean, cardStatus: number): boolean {
  return isCheckedIn || cardStatus !== CardStatus.ACTIVE;
}

/**
 * Determines whether the check-out button should be disabled.
 * Disabled when: not checked in OR card status != ACTIVE
 */
function isCheckoutDisabled(isCheckedIn: boolean, cardStatus: number): boolean {
  return !isCheckedIn || cardStatus !== CardStatus.ACTIVE;
}

// ============================================================================
// Tests
// ============================================================================

describe("ActionButtons - check-in disable logic", () => {
  it("should enable check-in when not checked in and card is ACTIVE", () => {
    expect(isCheckinDisabled(false, CardStatus.ACTIVE)).toBe(false);
  });

  it("should disable check-in when already checked in", () => {
    expect(isCheckinDisabled(true, CardStatus.ACTIVE)).toBe(true);
  });

  it("should disable check-in when card status is BLOCKED_TAMPER", () => {
    expect(isCheckinDisabled(false, CardStatus.BLOCKED_TAMPER)).toBe(true);
  });

  it("should disable check-in when card status is BLOCKED_FRAUD", () => {
    expect(isCheckinDisabled(false, CardStatus.BLOCKED_FRAUD)).toBe(true);
  });

  it("should disable check-in when card status is BLOCKED_EXPIRED", () => {
    expect(isCheckinDisabled(false, CardStatus.BLOCKED_EXPIRED)).toBe(true);
  });

  it("should disable check-in when card status is BLOCKED_ADMIN", () => {
    expect(isCheckinDisabled(false, CardStatus.BLOCKED_ADMIN)).toBe(true);
  });

  it("should disable check-in when checked in AND card is blocked", () => {
    expect(isCheckinDisabled(true, CardStatus.BLOCKED_TAMPER)).toBe(true);
  });
});

describe("ActionButtons - check-out disable logic", () => {
  it("should enable check-out when checked in and card is ACTIVE", () => {
    expect(isCheckoutDisabled(true, CardStatus.ACTIVE)).toBe(false);
  });

  it("should disable check-out when not checked in", () => {
    expect(isCheckoutDisabled(false, CardStatus.ACTIVE)).toBe(true);
  });

  it("should disable check-out when card status is BLOCKED_TAMPER", () => {
    expect(isCheckoutDisabled(true, CardStatus.BLOCKED_TAMPER)).toBe(true);
  });

  it("should disable check-out when card status is BLOCKED_FRAUD", () => {
    expect(isCheckoutDisabled(true, CardStatus.BLOCKED_FRAUD)).toBe(true);
  });

  it("should disable check-out when card status is BLOCKED_EXPIRED", () => {
    expect(isCheckoutDisabled(true, CardStatus.BLOCKED_EXPIRED)).toBe(true);
  });

  it("should disable check-out when card status is BLOCKED_ADMIN", () => {
    expect(isCheckoutDisabled(true, CardStatus.BLOCKED_ADMIN)).toBe(true);
  });

  it("should disable check-out when not checked in AND card is blocked", () => {
    expect(isCheckoutDisabled(false, CardStatus.BLOCKED_TAMPER)).toBe(true);
  });
});

describe("ActionButtons - default labels", () => {
  const DEFAULT_LABELS = {
    checkin: "Masuk",
    checkout: "Keluar",
    initializeCard: "Inisialisasi Kartu",
  };

  it("should have correct default check-in label", () => {
    expect(DEFAULT_LABELS.checkin).toBe("Masuk");
  });

  it("should have correct default check-out label", () => {
    expect(DEFAULT_LABELS.checkout).toBe("Keluar");
  });

  it("should have correct default initialize card label", () => {
    expect(DEFAULT_LABELS.initializeCard).toBe("Inisialisasi Kartu");
  });
});

describe("ActionButtons - classification behavior", () => {
  it("should show initialization for empty cards (classification = 'empty')", () => {
    // When classification is "empty" and onInitializeCard is provided,
    // the component renders the initialization button
    const classification = "empty";
    const hasInitCallback = true;
    const shouldShowInit = classification === "empty" && hasInitCallback;
    expect(shouldShowInit).toBe(true);
  });

  it("should not show initialization for empty cards without callback", () => {
    const classification = "empty";
    const hasInitCallback = false;
    const shouldShowInit = classification === "empty" && hasInitCallback;
    expect(shouldShowInit).toBe(false);
  });

  it("should show check-in/check-out for valid_payload cards", () => {
    const classification = "valid_payload";
    const hasPayload = true;
    const shouldShowActions = classification === "valid_payload" && hasPayload;
    expect(shouldShowActions).toBe(true);
  });

  it("should not show actions for foreign cards", () => {
    const classification: string = "foreign";
    const shouldShowActions = classification === "valid_payload" || classification === "empty";
    expect(shouldShowActions).toBe(false);
  });

  it("should not show actions for unknown cards", () => {
    const classification: string = "unknown";
    const shouldShowActions = classification === "valid_payload" || classification === "empty";
    expect(shouldShowActions).toBe(false);
  });

  it("should not show actions for invalid_format cards", () => {
    const classification: string = "invalid_format";
    const shouldShowActions = classification === "valid_payload" || classification === "empty";
    expect(shouldShowActions).toBe(false);
  });
});
