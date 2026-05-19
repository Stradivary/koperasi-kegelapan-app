# Station Checkout & PWA Fixes — Bugfix Design

## Overview

This design addresses 6 bugs in the MBCS PWA application that collectively degrade the Station operator experience and prevent reliable offline-first operation. The bugs span checkout flow logic (24h expiry, no-op callbacks), data synchronization (card sync after NFC ops), UI polish (inconsistent styling), and PWA reliability (offline mode, service worker, install/update prompts).

The fix strategy is:
1. **Bug 1 & 6** (checkout logic): Wire real checkout flow into `StationSection` with automatic 24h force-checkout when session is expired, capping fee at 24h max.
2. **Bug 2** (card sync): Ensure card payload data syncs to local IndexedDB (Dexie `localDb.cards`) immediately after every successful NFC operation.
3. **Bug 3** (UI styling): Polish Lucide icon usage, spacing, and component hierarchy using existing design tokens.
4. **Bug 4** (offline mode): Add an `OfflineIndicator` component to the root route and ensure all pages degrade gracefully when offline.
5. **Bug 5** (PWA): Harden service worker registration, pre-caching, install prompt lifecycle, and update notification mechanism.

## Glossary

- **Bug_Condition (C)**: The condition that triggers each bug — session expiry without checkout, missing card sync, broken offline pages, unreliable PWA, no-op checkout callbacks
- **Property (P)**: The desired behavior when the bug condition is met — auto force-checkout, immediate sync, graceful offline, reliable PWA, real checkout flow
- **Preservation**: Existing behaviors that must remain unchanged — normal checkout for non-expired sessions, gate simulation mode, mouse/touch interactions, online data fetching
- **`validateTransition`**: Function in `src/core/state-machine/engine.ts` that validates state machine transitions
- **`applyCheckout`**: Function in `src/core/state-machine/engine.ts` that calculates fee and produces new payload
- **`isSessionExpired`**: Function in `src/core/state-machine/engine.ts` that checks 24h + 1h drift tolerance
- **`PARKING_RATE_PER_HOUR`**: Constant = 2000 (IDR per hour)
- **`localDb`**: Dexie database (`src/db/local-db.ts`) with `cards`, `users`, `auditLog`, `transactionLog` tables
- **`reconciliationOutbox`**: IndexedDB store for pending sync events (`src/lib/indexeddb.ts`)
- **`NfcScanDrawer`**: Reusable drawer component for NFC scan/write lifecycle
- **`StationSection`**: Main station management component that currently passes `onCheckout={() => {}}`

## Bug Details

### Bug 1: 24h Session Expiry — Card Stays Active

The bug manifests when a member's parking session exceeds 24 hours (+ 1h drift tolerance = 25h total). The `isSessionExpired` function correctly detects expiry, but there is no automatic force-checkout mechanism. The card remains in `CHECKED_IN` or `STATION_OPERATION` state with no way for the operator to check out the member.

**Formal Specification:**
```
FUNCTION isBugCondition_SessionExpired(input)
  INPUT: input of type { payload: CardPayload, nowSeconds: number }
  OUTPUT: boolean
  
  RETURN isSessionExpired(input.payload, input.nowSeconds) = true
         AND input.payload.wallet.state IN {CHECKED_IN, STATION_OPERATION}
         AND input.payload.identity.status = ACTIVE
END FUNCTION
```

### Bug 6: Checkout Uses No-Op Simulation on Station/Terminal

The `StationSection` component passes `onCheckout={() => {}}` to `NfcScanDrawer`, making the checkout button a no-op. The actual checkout flow (`validateTransition` → `applyCheckout` → NFC write → local DB update) is never invoked from Station or Terminal modes.

**Formal Specification:**
```
FUNCTION isBugCondition_CheckoutSimulation(input)
  INPUT: input of type { trigger: "checkout", source: string, payload: CardPayload }
  OUTPUT: boolean
  
  RETURN input.trigger = "checkout"
         AND input.source IN {"station", "terminal"}
         AND input.payload.wallet.state IN {CHECKED_IN, STATION_OPERATION}
END FUNCTION
```

### Bug 2: Card Sync After NFC Operations

After successful NFC operations (scan, top-up, issue, fix), the card's current payload data is not consistently synced to the local IndexedDB. The existing `useEffect` hooks in `StationSection` partially handle this for `phase=ready` and `phase=success`, but the sync is incomplete for all operation types and doesn't cover all card fields.

**Formal Specification:**
```
FUNCTION isBugCondition_CardSyncMissing(input)
  INPUT: input of type { phase: NfcCardPhase, payload: CardPayload, serialNumber: string }
  OUTPUT: boolean
  
  RETURN input.phase IN {"ready", "success"}
         AND input.payload IS NOT NULL
         AND input.serialNumber IS NOT NULL
         AND localDb.cards[input.serialNumber].balance != input.payload.wallet.balance
END FUNCTION
```

### Bug 3: UI Styling Inconsistencies

Lucide icons are used inconsistently (mixed sizes, missing stroke-width standardization), spacing between components doesn't follow a consistent scale, and component hierarchy lacks visual cohesion.

### Bug 4: Offline Mode — Pages Break

When the application loses network connectivity, some pages break because they depend on network-fetched data without fallback. There is no offline indicator to inform the user of connectivity status.

**Formal Specification:**
```
FUNCTION isBugCondition_OfflineBreak(input)
  INPUT: input of type { isOnline: boolean, route: string }
  OUTPUT: boolean
  
  RETURN input.isOnline = false
         AND pageRendersWithoutError(input.route) = false
END FUNCTION
```

### Bug 5: PWA Functionality Unreliable

Service worker registration, pre-caching of critical assets, install prompt capture, and update notification don't work reliably across all scenarios.

### Examples

- **Bug 1**: Member checks in at 8:00 AM Monday. At 10:00 AM Tuesday (26h later), operator scans card → system shows "Session expired" error but card stays CHECKED_IN with no checkout option
- **Bug 6**: Operator taps "Keluar" (checkout) button in NfcScanDrawer → nothing happens because `onCheckout={() => {}}`
- **Bug 2**: Operator tops up card via TopupDrawer → NFC write succeeds → local DB still shows old balance until next sync pull
- **Bug 4**: Device goes offline → operator navigates to transactions page → page shows error/blank instead of cached data
- **Bug 5**: User installs PWA → closes browser → reopens → service worker not active, assets not cached

## Expected Behavior

### Preservation Requirements

**Unchanged Behaviors:**
- Normal checkout for sessions under 24h must continue with standard fee calculation (hours × PARKING_RATE_PER_HOUR capped at balance)
- Gate (check-in) mode must continue using simulation/no-op for check-in operations
- Top-up, debit, card issue, and fix operations must continue working correctly
- Mouse/touch interactions on all buttons must remain functional
- Online mode must continue fetching fresh data via NetworkFirst strategy for API calls
- Cards with non-active status (blocked, tampered) must continue to be rejected
- PWA update prompt dismissal must not force an update

**Scope:**
All inputs that do NOT involve the specific bug conditions should be completely unaffected by these fixes. This includes:
- Normal parking sessions (< 24h)
- Gate mode operations
- Online data fetching
- Non-NFC UI interactions
- Card operations on blocked/tampered cards

## Hypothesized Root Cause

Based on the bug analysis, the root causes are:

1. **Bug 1 — Missing Auto Force-Checkout Logic**: The `validateTransition` function correctly allows `force_checkout` from expired sessions, but no component invokes it automatically when expiry is detected during a scan. The UI shows an error but provides no recovery path.

2. **Bug 6 — No-Op Callback in StationSection**: `StationSection.tsx` line passes `onCheckout={() => {}}` to `NfcScanDrawer`. The checkout flow logic (validate → apply → write → sync) was never implemented for Station/Terminal mode.

3. **Bug 2 — Incomplete Sync Coverage**: The `useEffect` hooks in `StationSection` sync on `phase=ready` and `phase=success`, but only update `balance`, `counter`, and `lastActivityAt`. Missing: `status` field sync, and the sync doesn't cover all NFC operation paths consistently.

4. **Bug 3 — Organic UI Growth**: Components were added incrementally without a unified icon size/spacing standard.

5. **Bug 4 — No Offline Fallback in Route Components**: Route components use `useQuery` without `staleTime` or `placeholderData` from local DB, causing them to show loading/error states when offline. No global offline indicator exists.

6. **Bug 5 — PWA Configuration Gaps**: The VitePWA config is mostly correct but may have edge cases with `injectRegister: "auto"` not reliably registering on all browsers, and the `PwaUpdatePrompt` component doesn't handle the case where the SW update check fails silently.

## Correctness Properties

Property 1: Bug Condition — Expired Session Auto Force-Checkout

_For any_ input where `isSessionExpired(payload, nowSeconds)` returns true AND the card state is CHECKED_IN or STATION_OPERATION, the fixed checkout handler SHALL automatically perform a force-checkout with fee capped at `min(24 * PARKING_RATE_PER_HOUR, payload.wallet.balance)`, transition the card to CHECKED_OUT state, write the updated payload to NFC, and record an audit entry with type "missed_checkout".

**Validates: Requirements 2.1**

Property 2: Bug Condition — Real Checkout Flow on Station/Terminal

_For any_ checkout trigger from Station or Terminal mode where the card is in CHECKED_IN or STATION_OPERATION state, the fixed handler SHALL invoke `validateTransition` → `applyCheckout` → NFC write → local DB update, producing a CHECKED_OUT state with correct fee deduction.

**Validates: Requirements 2.6**

Property 3: Bug Condition — Card Sync After NFC Operations

_For any_ successful NFC operation (phase transitions to "ready" or "success" with a non-null payload and serial number), the fixed system SHALL immediately sync the card's balance, counter, status, and lastActivityAt to `localDb.cards` in IndexedDB.

**Validates: Requirements 2.2**

Property 4: Bug Condition — Offline Graceful Degradation

_For any_ route navigation when `navigator.onLine` is false, the fixed system SHALL render the page using cached assets and local IndexedDB data without errors, and display a visible offline indicator.

**Validates: Requirements 2.4**

Property 5: Bug Condition — PWA Reliable Registration

_For any_ PWA installation or update scenario, the fixed system SHALL successfully register the service worker, pre-cache critical assets, capture the install prompt on eligible devices, and notify users of available updates.

**Validates: Requirements 2.5**

Property 6: Preservation — Normal Sessions Unaffected

_For any_ input where `isSessionExpired(payload, nowSeconds)` returns false, the fixed checkout function SHALL produce the same result as the original function with standard fee calculation (actual hours × PARKING_RATE_PER_HOUR capped at balance).

**Validates: Requirements 3.1**

Property 7: Preservation — Gate Simulation Mode Preserved

_For any_ check-in operation from Gate mode, the fixed system SHALL continue to use simulation mode exactly as before, with no changes to gate behavior.

**Validates: Requirements 3.7**

Property 8: Preservation — Failed NFC Operations Don't Sync

_For any_ NFC operation that fails (phase = "error", aborted, or partial read/write), the fixed system SHALL NOT sync any data to the local database, preserving data integrity.

**Validates: Requirements 3.2**

## Fix Implementation

### Changes Required

#### Bug 1 & 6: Real Checkout with 24h Auto Force-Checkout

**File**: `src/components/section/StationSection.tsx`

**Changes**:
1. **Implement `handleCheckout` callback**: Replace `onCheckout={() => {}}` with a real checkout handler that:
   - Detects if session is expired via `isSessionExpired(payload, nowSeconds)`
   - If expired: use `force_checkout` trigger, cap fee at `24 * PARKING_RATE_PER_HOUR`
   - If not expired: use `gate_checkout` trigger, calculate fee normally
   - Call `validateTransition(payload, trigger, nowSeconds)`
   - Call `applyCheckout(payload, nowSeconds)` (fee already capped internally by balance)
   - For expired sessions: override the fee calculation to cap at 24h max
   - Call `write(updatedPayload, "checkout")` to write to NFC
   - Record audit log entry with type `"missed_checkout"` for expired sessions

2. **Add `applyForceCheckout` helper function**:

```typescript
interface ForceCheckoutResult {
  payload: CardPayload;
  fee: number;
  isMissedCheckout: boolean;
}

function applyForceCheckout(payload: CardPayload, nowSeconds: number): ForceCheckoutResult {
  const MAX_HOURS = 24;
  const maxFee = MAX_HOURS * PARKING_RATE_PER_HOUR;
  const fee = Math.min(maxFee, payload.wallet.balance);
  const newBalance = payload.wallet.balance - fee;
  const newCounter = payload.wallet.counter + 1n;
  
  return {
    payload: {
      ...payload,
      wallet: {
        ...payload.wallet,
        state: CardState.CHECKED_OUT,
        lastBalance: payload.wallet.balance,
        balance: newBalance,
        counter: newCounter,
        lastTimestamp: nowSeconds,
      },
      session: { ...payload.session, endTime: nowSeconds },
      logEntries: buildLogEntry(payload.logEntries, {
        deltaTime: 0xffff, // max (capped at 24h)
        amount: fee,
        balanceAfter: newBalance,
        flags: TxType.CHECKOUT,
        hash: new Uint8Array(6),
      }),
    },
    fee,
    isMissedCheckout: true,
  };
}
```

3. **Wire `handleCheckout` into NfcScanDrawer**:

```typescript
const handleCheckout = useCallback(async () => {
  if (!state.payload || !grant) return;
  const now = Math.floor(Date.now() / 1000);
  const expired = isSessionExpired(state.payload, now);
  const trigger = expired ? "force_checkout" : "gate_checkout";
  
  const validation = validateTransition(state.payload, trigger, now);
  if (!validation.valid) {
    // Show error toast
    return;
  }
  
  let updatedPayload: CardPayload;
  let operationType: string;
  
  if (expired) {
    const result = applyForceCheckout(state.payload, now);
    updatedPayload = result.payload;
    operationType = "missed_checkout";
  } else {
    updatedPayload = applyCheckout(state.payload, now);
    operationType = "checkout";
  }
  
  await write(updatedPayload, operationType);
}, [state.payload, grant, write]);
```

4. **Record audit log for missed_checkout**:

```typescript
// In the success useEffect, after NFC write succeeds:
if (operationType === "missed_checkout") {
  await localDb.auditLog.add({
    tenantId,
    cardId: normalizeSerial(state.serialNumber)!,
    counter: Number(updatedPayload.wallet.counter),
    type: "checkout",
    amount: fee,
    balanceAfter: updatedPayload.wallet.balance,
    timestamp: now,
    hash: "",
    terminalId,
    flagged: true, // flag missed checkouts
    createdAt: Date.now(),
  });
}
```

**File**: `src/core/state-machine/engine.ts`

**Changes**:
5. **Export `applyForceCheckout`** as a new function that caps fee at 24h max:

```typescript
export function applyForceCheckout(payload: CardPayload, nowSeconds: number): CardPayload {
  const MAX_SESSION_HOURS = 24;
  const maxFee = MAX_SESSION_HOURS * PARKING_RATE_PER_HOUR;
  const fee = Math.min(maxFee, payload.wallet.balance);
  const newBalance = payload.wallet.balance - fee;
  const newCounter = payload.wallet.counter + 1n;
  return {
    ...payload,
    wallet: {
      ...payload.wallet,
      state: CardState.CHECKED_OUT,
      lastBalance: payload.wallet.balance,
      balance: newBalance,
      counter: newCounter,
      lastTimestamp: nowSeconds,
    },
    session: { ...payload.session, endTime: nowSeconds },
    logEntries: buildLogEntry(payload.logEntries, {
      deltaTime: 0xffff,
      amount: fee,
      balanceAfter: newBalance,
      flags: TxType.CHECKOUT,
      hash: new Uint8Array(6),
    }),
  };
}
```

---

#### Bug 2: Card Sync After NFC Operations

**File**: `src/components/section/StationSection.tsx`

**Changes**:
1. **Enhance existing `useEffect` for `phase=ready`** to sync all relevant fields:

```typescript
useEffect(() => {
  if (state.phase !== "ready" || !state.payload) return;
  const payload = state.payload;
  const cardId = normalizeSerial(state.serialNumber);
  if (!cardId) return;

  syncCardToLocalDb(tenantId, cardId, payload);
}, [state.phase, state.payload, state.serialNumber, tenantId, qc]);
```

2. **Extract `syncCardToLocalDb` utility function**:

```typescript
async function syncCardToLocalDb(
  tenantId: string,
  cardId: string,
  payload: CardPayload,
): Promise<void> {
  const now = Math.floor(Date.now() / 1000);
  const existing = await localDb.cards.get([tenantId, cardId]);
  
  const syncData = {
    balance: payload.wallet.balance,
    counter: Number(payload.wallet.counter),
    status: mapCardStatus(payload.identity.status),
    lastActivityAt: now,
  };
  
  if (existing) {
    await localDb.cards.update([tenantId, cardId], syncData);
  } else {
    await localDb.cards.put({
      tenantId,
      cardId,
      userId: payload.identity.userId || null,
      status: syncData.status,
      balance: syncData.balance,
      counter: syncData.counter,
      keyVersion: payload.trailer.keyVersion,
      createdAt: payload.identity.createdAt,
      lastActivityAt: now,
      expiresAt: payload.trailer.expiresAt < 9_999_999_999 ? payload.trailer.expiresAt : null,
      notes: payload.identity.name,
    });
  }
}

function mapCardStatus(status: CardStatus): Card["status"] {
  switch (status) {
    case CardStatus.ACTIVE: return "active";
    case CardStatus.BLOCKED_TAMPER: return "blocked_tamper";
    case CardStatus.BLOCKED_FRAUD: return "blocked_fraud";
    default: return "blocked_admin";
  }
}
```

3. **Ensure `phase=success` also syncs** with the final written payload (post-write state).

---

#### Bug 3: UI Styling Polish

**Files**: Multiple component files

**Changes**:
1. **Standardize Lucide icon sizes**: Use `size={16}` for inline/body, `size={20}` for buttons, `size={24}` for section headers, `size={40}` for hero/empty states
2. **Consistent spacing**: Use Tailwind spacing scale (`gap-2`, `gap-3`, `gap-4`, `space-y-3`, `space-y-4`) consistently
3. **Component hierarchy**: Ensure cards use `rounded-2xl`, sections use `rounded-xl`, buttons use `rounded-lg`
4. **Design token usage**: Apply `type-body1`, `type-body1-bold`, `type-body2`, `type-title-bold` consistently

---

#### Bug 4: Offline Mode — Graceful Degradation

**File**: `src/components/block/OfflineIndicator.tsx` (NEW)

**Changes**:
1. **Create `useOnlineStatus` hook**:

```typescript
// src/hooks/useOnlineStatus.ts
export function useOnlineStatus(): boolean {
  const [isOnline, setIsOnline] = useState(
    typeof navigator !== "undefined" ? navigator.onLine : true
  );

  useEffect(() => {
    const handleOnline = () => setIsOnline(true);
    const handleOffline = () => setIsOnline(false);
    window.addEventListener("online", handleOnline);
    window.addEventListener("offline", handleOffline);
    return () => {
      window.removeEventListener("online", handleOnline);
      window.removeEventListener("offline", handleOffline);
    };
  }, []);

  return isOnline;
}
```

2. **Create `OfflineIndicator` component**:

```typescript
// src/components/block/OfflineIndicator.tsx
export function OfflineIndicator() {
  const isOnline = useOnlineStatus();
  if (isOnline) return null;
  
  return (
    <div className="fixed top-0 left-0 right-0 z-[60] bg-signal-bg-warning border-b border-signal-warning px-4 py-2 text-center">
      <p className="type-body2-bold text-signal-warning">
        Mode Offline — Data lokal digunakan
      </p>
    </div>
  );
}
```

3. **Add `OfflineIndicator` to root route** (`src/routes/__root.tsx`):

```typescript
function RootComponent() {
  return (
    <TooltipProvider>
      <OfflineIndicator />
      <Outlet />
      <Toaster />
      ...
    </TooltipProvider>
  );
}
```

4. **Add offline fallback to route queries**: Use `staleTime: Infinity` and `placeholderData` from local DB when offline, so pages render with cached data instead of showing errors.

---

#### Bug 5: PWA Hardening

**File**: `vite.config.ts`

**Changes**:
1. **Ensure `injectRegister` is set correctly**: Keep `"auto"` but verify SW registration in the app
2. **Add `skipWaiting: true`** to workbox config for immediate activation
3. **Add `clientsClaim: true`** to workbox config so new SW takes control immediately

```typescript
workbox: {
  globPatterns: ["**/*.{js,css,html,ico,png,svg,woff,woff2,ttf,json}"],
  maximumFileSizeToCacheInBytes: 5 * 1024 * 1024,
  navigateFallback: "/index.html",
  navigateFallbackDenylist: [/^\/api\//],
  skipWaiting: true,
  clientsClaim: true,
  runtimeCaching: [
    {
      urlPattern: /^https?:\/\/.*\/api\/.*/i,
      handler: "NetworkFirst",
      options: {
        cacheName: "api-cache",
        expiration: { maxEntries: 50, maxAgeSeconds: 60 * 60 * 24 },
        networkTimeoutSeconds: 5,
      },
    },
  ],
},
```

**File**: `src/components/block/PwaUpdatePrompt.tsx`

**Changes**:
4. **Add error handling for SW registration failure**
5. **Add retry logic for update checks**

**File**: `src/hooks/useInstallPrompt.ts`

**Changes**:
6. **Add `display-mode: minimal-ui`** to the media query check (some browsers use this)
7. **Persist dismissal state** to localStorage so prompt doesn't re-appear on same session

## Testing Strategy

### Validation Approach

The testing strategy follows a two-phase approach: first, surface counterexamples that demonstrate the bugs on unfixed code, then verify the fixes work correctly and preserve existing behavior.

### Exploratory Bug Condition Checking

**Goal**: Surface counterexamples that demonstrate the bugs BEFORE implementing the fix. Confirm or refute the root cause analysis.

**Test Plan**: Write unit tests that exercise the checkout flow with expired sessions and verify the no-op behavior. Run on UNFIXED code to observe failures.

**Test Cases**:
1. **Expired Session Checkout Test**: Create a payload with `lastTimestamp` > 25h ago, call checkout handler → observe no state change (will fail on unfixed code)
2. **Station No-Op Checkout Test**: Simulate checkout button press in Station mode → observe `onCheckout` is a no-op (will fail on unfixed code)
3. **Card Sync Missing Test**: Complete a top-up operation, check localDb → observe stale balance (will fail on unfixed code)
4. **Offline Page Render Test**: Set `navigator.onLine = false`, render a route → observe error state (will fail on unfixed code)

**Expected Counterexamples**:
- Checkout handler does nothing for expired sessions
- `onCheckout={() => {}}` produces no state change
- localDb.cards shows stale data after NFC operations

### Fix Checking

**Goal**: Verify that for all inputs where the bug condition holds, the fixed function produces the expected behavior.

**Pseudocode:**
```
FOR ALL input WHERE isBugCondition_SessionExpired(input) DO
  result := handleCheckout_fixed(input)
  ASSERT result.payload.wallet.state = CHECKED_OUT
  ASSERT result.fee <= 24 * PARKING_RATE_PER_HOUR
  ASSERT result.fee <= input.payload.wallet.balance
  ASSERT result.auditType = "missed_checkout"
END FOR

FOR ALL input WHERE isBugCondition_CheckoutSimulation(input) DO
  result := handleCheckout_fixed(input)
  ASSERT result.payload.wallet.state = CHECKED_OUT
  ASSERT result.nfcWritePerformed = true
  ASSERT result.localDbUpdated = true
END FOR
```

### Preservation Checking

**Goal**: Verify that for all inputs where the bug condition does NOT hold, the fixed function produces the same result as the original function.

**Pseudocode:**
```
FOR ALL input WHERE NOT isBugCondition_SessionExpired(input) 
  AND input.payload.wallet.state IN {CHECKED_IN, STATION_OPERATION} DO
  ASSERT applyCheckout_original(input) = applyCheckout_fixed(input)
END FOR

FOR ALL input WHERE input.source = "gate" DO
  ASSERT gateHandler_original(input) = gateHandler_fixed(input)
END FOR

FOR ALL input WHERE input.phase = "error" OR input.payload = null DO
  ASSERT localDbState_before = localDbState_after  // no sync on failure
END FOR
```

**Testing Approach**: Property-based testing is recommended for preservation checking because:
- It generates many random CardPayload configurations to verify fee calculation is unchanged for non-expired sessions
- It catches edge cases in balance/fee arithmetic that manual tests might miss
- It provides strong guarantees that gate mode behavior is completely unchanged

**Test Plan**: Observe behavior on UNFIXED code first for normal checkouts and gate operations, then write property-based tests capturing that behavior.

**Test Cases**:
1. **Normal Checkout Preservation**: Verify `applyCheckout` produces identical results for sessions < 24h
2. **Gate Mode Preservation**: Verify gate check-in simulation is completely unchanged
3. **Failed NFC No-Sync Preservation**: Verify no local DB writes occur when NFC operations fail
4. **Blocked Card Rejection Preservation**: Verify cards with non-active status are still rejected

### Unit Tests

- Test `applyForceCheckout` with various balances and verify fee is capped at 24h max
- Test `applyForceCheckout` with balance < 24h fee and verify fee is capped at balance
- Test `handleCheckout` detects expired sessions and uses force_checkout trigger
- Test `handleCheckout` uses gate_checkout for non-expired sessions
- Test `syncCardToLocalDb` updates all fields correctly
- Test `syncCardToLocalDb` creates new card entry when not in local DB
- Test `OfflineIndicator` renders when offline, hidden when online
- Test `useOnlineStatus` responds to online/offline events

### Property-Based Tests

- Generate random `CardPayload` with `lastTimestamp` in range [0, now] and verify:
  - If expired: fee = min(24 * RATE, balance), state = CHECKED_OUT
  - If not expired: fee = ceil(hours) * RATE capped at balance, state = CHECKED_OUT
- Generate random non-expired payloads and verify `applyCheckout` output matches original function exactly (preservation)
- Generate random payloads with various `CardStatus` values and verify blocked cards are always rejected
- Generate random NFC operation results (success/failure) and verify sync only occurs on success

### Integration Tests

- Test full checkout flow: scan card → detect expiry → auto force-checkout → NFC write → local DB update → audit log
- Test normal checkout flow: scan card → checkout → fee calculation → NFC write → local DB update
- Test offline navigation: disable network → navigate between routes → verify pages render with cached data
- Test PWA install flow: trigger beforeinstallprompt → show prompt → user accepts → verify installed state
- Test PWA update flow: new SW available → show update prompt → user clicks update → page reloads with new version
