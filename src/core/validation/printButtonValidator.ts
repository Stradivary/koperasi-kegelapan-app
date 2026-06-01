/**
 * PrintButtonValidator - Evaluates whether the print button should be enabled
 * based on the final card state and user options.
 *
 * Priority order:
 * 1. Card not found in IndexedDB → "CARD_NOT_FOUND"
 * 2. Card status is blocked → "CARD_BLOCKED"
 * 3. No member selected AND zero balance → "NO_MEMBER_NO_BALANCE"
 * 4. Otherwise → enabled
 *
 * @see Requirements 1.1, 1.2, 1.3, 1.4, 1.5, 1.6
 */

import type { CardRecord } from "../interfaces/types";
import type { CardRepository } from "../interfaces/CardRepository";

/** Result of print eligibility evaluation */
export interface PrintEligibility {
  enabled: boolean;
  reason?: "NO_MEMBER_NO_BALANCE" | "CARD_BLOCKED" | "CARD_NOT_FOUND";
}

/** Options for print eligibility evaluation */
export interface PrintOptions {
  withMember: boolean;
}

/**
 * Synchronously evaluates print eligibility given a card record and options.
 *
 * This is the pure logic extracted for use in the reactive hook, allowing
 * synchronous re-evaluation when `withMember` changes without re-fetching
 * from IndexedDB.
 *
 * @param card - Card record from IndexedDB, or undefined if not found
 * @param options - Print options including withMember flag
 * @returns PrintEligibility result
 */
export function evaluatePrintEligibilitySync(
  card: CardRecord | undefined,
  options: PrintOptions,
): PrintEligibility {
  // Requirement 1.1: Card not found → CARD_NOT_FOUND
  if (card === undefined) {
    return { enabled: false, reason: "CARD_NOT_FOUND" };
  }

  // Requirement 1.2: Blocked status takes precedence
  if (card.status !== "active") {
    return { enabled: false, reason: "CARD_BLOCKED" };
  }

  // Requirement 1.3: No member + zero balance → NO_MEMBER_NO_BALANCE
  if (options.withMember === false && card.balance === 0) {
    return { enabled: false, reason: "NO_MEMBER_NO_BALANCE" };
  }

  // Requirement 1.4: Otherwise → enabled
  return { enabled: true };
}

/**
 * Evaluates whether the print button should be enabled for a given card.
 *
 * Reads the card from local IndexedDB and applies the priority rules:
 * 1. Card not found → "CARD_NOT_FOUND"
 * 2. Card blocked → "CARD_BLOCKED"
 * 3. No member + zero balance → "NO_MEMBER_NO_BALANCE"
 * 4. Otherwise → enabled
 *
 * Preconditions:
 * - `cardId` is a non-empty hex string
 * - `tenantId` is a valid tenant identifier
 *
 * Postconditions:
 * - Returns appropriate PrintEligibility based on priority rules
 * - No side effects on card data
 * - On IndexedDB read failure → returns "CARD_NOT_FOUND" (Requirement 1.6)
 *
 * @param cardId - Card identifier (hex string)
 * @param options - Print options including withMember flag
 * @param tenantId - Tenant identifier
 * @returns Promise<PrintEligibility>
 */
export async function evaluatePrintEligibility(
  cardId: string,
  options: PrintOptions,
  tenantId: string,
  deps: { cardRepo: CardRepository },
): Promise<PrintEligibility> {
  let card: CardRecord | undefined;

  try {
    card = await deps.cardRepo.getByTenantAndCardId(tenantId, cardId);
  } catch {
    // Requirement 1.6: IndexedDB read failure → CARD_NOT_FOUND
    return { enabled: false, reason: "CARD_NOT_FOUND" };
  }

  return evaluatePrintEligibilitySync(card, options);
}
