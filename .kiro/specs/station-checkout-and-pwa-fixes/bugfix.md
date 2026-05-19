# Bugfix Requirements Document

## Introduction

This document addresses 6 independent bugs in the MBCS (Member Card Station) PWA application related to checkout flow, card synchronization, styling, offline mode, PWA functionality, and checkout implementation method. These bugs collectively degrade the Station operator experience and prevent reliable offline-first operation of the PWA.

**Out of Scope:** Device login and device binding (depend on tenant-management-enhanced spec).

---

## Bug Analysis

### Current Behavior (Defect)

1.1 WHEN a member's session exceeds 24 hours and the checkout validation triggers a session-expired error THEN the system leaves the member's card status as "active" in the Station's local database with no mechanism to check out the member; the member is effectively stuck

1.2 WHEN a member card is used at the Station (scan, top-up, issue, or fix operation) THEN the system does not perform a sync operation to update the Station's local database with the latest card data from the physical NFC card after the operation completes

1.3 WHEN the Station UI is rendered THEN the styling is incomplete — iconography uses Lucide inconsistently, layout spacing and component hierarchy need polish for a stable, beautiful UI

1.4 WHEN the application loses network connectivity THEN some pages break or become unusable instead of gracefully degrading to offline mode across all routes

1.5 WHEN the PWA is installed or updated THEN the service worker registration, caching strategy, install prompt, and update mechanism do not function reliably across all supported scenarios (install, offline navigation, background updates)

1.6 WHEN a checkout operation is triggered from the Station/Terminal NfcScanDrawer THEN the system uses empty no-op callbacks (`onCheckout={() => {}}`) as a simulation instead of invoking the actual checkout flow; additionally the Gate (check-in) mode correctly uses simulation but the Terminal mode incorrectly also uses simulation for checkout

---

### Expected Behavior (Correct)

2.1 WHEN a member's session exceeds 24 hours and the checkout validation triggers a session-expired condition THEN the system SHALL automatically perform a force checkout with the maximum fee capped at 24 hours (24 × PARKING_RATE_PER_HOUR), transition the card state to CHECKED_OUT, write the updated payload to the NFC card, and record the incident in the audit log as "missed checkout"

2.2 WHEN a member card is used at the Station (any NFC operation that reads or writes card data) THEN the system SHALL sync the card's current payload data (balance, counter, status, timestamps) to the Station's local IndexedDB immediately after the operation completes successfully

2.3 WHEN the Station UI is rendered THEN the system SHALL present a polished, stable UI with consistent Lucide iconography, proper spacing scale, clean component hierarchy, and visually cohesive layout using the existing Signal design tokens (type-body1, type-title-bold, signal-bg-*, brand-dark, etc.)

2.4 WHEN the application loses network connectivity THEN the system SHALL continue to function on all pages using cached assets and local IndexedDB data, displaying an offline indicator without breaking page rendering or navigation

2.5 WHEN the PWA is installed or updated THEN the system SHALL correctly register the service worker, pre-cache all critical assets, show an install prompt on eligible devices, and notify users of available updates with a reload mechanism

2.6 WHEN a checkout operation is triggered from the Station or Terminal NfcScanDrawer THEN the system SHALL invoke the actual checkout flow: validate the transition via `validateTransition(payload, "gate_checkout"|"force_checkout")`, apply the checkout via `applyCheckout(payload, nowSeconds)` with fee capped at 24h max, write the updated payload to the NFC card, and update the local database; the 24h force-checkout logic SHALL be triggered internally (not user-toggled); simulation mode SHALL be removed from Terminal but kept for Gate (check-in) mode

---

### Unchanged Behavior (Regression Prevention)

3.1 WHEN a member's session has NOT exceeded 24 hours THEN the system SHALL CONTINUE TO allow normal check-in, check-out, and station operations with standard fee calculation based on actual hours parked

3.2 WHEN a card is scanned but the NFC operation fails (read error, write error, abort) THEN the system SHALL CONTINUE TO NOT sync partial or corrupted data to the local database

3.3 WHEN the application is online THEN the system SHALL CONTINUE TO fetch fresh data from the server via NetworkFirst caching strategy for API calls

3.4 WHEN the Station performs top-up, debit, or card issue operations THEN the system SHALL CONTINUE TO process these operations correctly with proper balance calculations and NFC writes

3.5 WHEN the PWA update prompt is dismissed by the user THEN the system SHALL CONTINUE TO function normally without forcing an update until the next check interval

3.6 WHEN a card has status other than "active" (blocked, tampered) THEN the system SHALL CONTINUE TO reject checkout operations with appropriate error messages

3.7 WHEN the Gate (check-in) mode is used THEN the system SHALL CONTINUE TO use simulation mode for check-in operations as currently implemented

---

## Bug Condition Derivation

### Bug 1: Checkout 24h Validation — Status Stays Active

```pascal
FUNCTION isBugCondition_SessionExpired(X)
  INPUT: X of type { payload: CardPayload, nowSeconds: number }
  OUTPUT: boolean
  
  RETURN isSessionExpired(X.payload, X.nowSeconds) = true
    AND X.payload.wallet.state IN {CHECKED_IN, STATION_OPERATION}
END FUNCTION
```

```pascal
// Property: Fix Checking — Expired Session Auto-Checkout
FOR ALL X WHERE isBugCondition_SessionExpired(X) DO
  result ← handleExpiredSession'(X)
  ASSERT result.cardState = CHECKED_OUT
    AND result.fee = 24 * PARKING_RATE_PER_HOUR
    AND result.auditLog CONTAINS "missed_checkout"
    AND result.nfcWritePerformed = true
END FOR
```

### Bug 6: Checkout Uses Simulation (No-Op) on Station/Terminal

```pascal
FUNCTION isBugCondition_CheckoutSimulation(X)
  INPUT: X of type { trigger: "checkout", source: string }
  OUTPUT: boolean
  
  RETURN X.trigger = "checkout" 
    AND X.source IN {"station_nfc_drawer", "terminal_nfc_drawer"}
END FUNCTION
```

```pascal
// Property: Fix Checking — Real Checkout on Station/Terminal
FOR ALL X WHERE isBugCondition_CheckoutSimulation(X) DO
  result ← performCheckout'(X.payload, X.nowSeconds)
  fee ← MIN(hours_parked * PARKING_RATE_PER_HOUR, 24 * PARKING_RATE_PER_HOUR)
  ASSERT result.payload.wallet.state = CHECKED_OUT
    AND result.payload.wallet.balance = X.payload.wallet.balance - MIN(fee, X.payload.wallet.balance)
    AND result.nfcWritePerformed = true
    AND result.localDbUpdated = true
END FOR
```

### Preservation Goal

```pascal
// Property: Preservation Checking — Non-expired sessions unaffected
FOR ALL X WHERE NOT isBugCondition_SessionExpired(X) DO
  ASSERT F(X) = F'(X)
END FOR

// Property: Preservation Checking — Gate check-in simulation preserved
FOR ALL X WHERE X.source = "gate" AND X.trigger = "checkin" DO
  ASSERT F(X) = F'(X)  // Gate simulation mode unchanged
END FOR

// Property: Preservation Checking — Non-checkout operations unaffected
FOR ALL X WHERE X.trigger NOT IN {"checkout", "force_checkout"} DO
  ASSERT F(X) = F'(X)
END FOR
```
