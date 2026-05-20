/**
 * usePrintEligibility — Reactive hook for print button eligibility.
 *
 * Re-evaluates synchronously within the same render cycle when `withMember`
 * changes (Requirement 1.5). Uses a cached card record from IndexedDB and
 * applies the pure evaluation logic synchronously on each render.
 *
 * @see Requirements 1.1, 1.2, 1.3, 1.4, 1.5, 1.6
 */

import { useEffect, useMemo, useState } from "react";
import { localDb, type Card } from "../db/local-db";
import {
  evaluatePrintEligibilitySync,
  type PrintEligibility,
  type PrintOptions,
} from "../core/validation/printButtonValidator";

/**
 * Reactive hook that evaluates print button eligibility.
 *
 * The hook fetches the card record from IndexedDB asynchronously, then
 * uses `useMemo` to synchronously re-evaluate the eligibility whenever
 * `withMember` changes — ensuring the result updates within the same
 * render cycle (Requirement 1.5).
 *
 * @param cardId - Card identifier (hex string), or null if no card selected
 * @param options - Print options including withMember flag
 * @param tenantId - Tenant identifier
 * @returns PrintEligibility result (reactive)
 */
export function usePrintEligibility(
  cardId: string | null,
  options: PrintOptions,
  tenantId: string,
): PrintEligibility {
  const [card, setCard] = useState<Card | undefined>(undefined);
  const [cardLoaded, setCardLoaded] = useState(false);

  // Fetch card from IndexedDB when cardId or tenantId changes
  useEffect(() => {
    if (!cardId || !tenantId) {
      setCard(undefined);
      setCardLoaded(true);
      return;
    }

    let cancelled = false;

    async function fetchCard() {
      try {
        const result = await localDb.cards.get([tenantId, cardId!]);
        if (!cancelled) {
          setCard(result);
          setCardLoaded(true);
        }
      } catch {
        // Requirement 1.6: IndexedDB read failure → treat as not found
        if (!cancelled) {
          setCard(undefined);
          setCardLoaded(true);
        }
      }
    }

    setCardLoaded(false);
    void fetchCard();

    return () => {
      cancelled = true;
    };
  }, [cardId, tenantId]);

  // Requirement 1.5: Re-evaluate synchronously when withMember changes.
  // useMemo ensures the result is computed within the same render cycle
  // without waiting for any async operation.
  const eligibility = useMemo<PrintEligibility>(() => {
    if (!cardId) {
      return { enabled: false, reason: "CARD_NOT_FOUND" };
    }

    if (!cardLoaded) {
      // While loading, default to disabled with CARD_NOT_FOUND
      return { enabled: false, reason: "CARD_NOT_FOUND" };
    }

    return evaluatePrintEligibilitySync(card, options);
  }, [cardId, card, cardLoaded, options]);

  return eligibility;
}
