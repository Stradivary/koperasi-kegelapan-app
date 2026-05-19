# Implementation Plan

- [ ] 1. Write bug condition exploration test
  - **Property 1: Bug Condition** - Expired Session & No-Op Checkout
  - **CRITICAL**: This test MUST FAIL on unfixed code - failure confirms the bugs exist
  - **DO NOT attempt to fix the test or the code when it fails**
  - **NOTE**: This test encodes the expected behavior - it will validate the fix when it passes after implementation
  - **GOAL**: Surface counterexamples that demonstrate Bug 1 (24h expiry leaves card active) and Bug 6 (checkout is no-op on Station/Terminal)
  - **Scoped PBT Approach**: Scope the property to concrete failing cases:
    - Case A: CardPayload with `lastTimestamp` > 25h ago (expired session), card state CHECKED_IN → expect force-checkout to CHECKED_OUT with fee capped at `min(24 * 2000, balance)`
    - Case B: Checkout trigger from source "station" or "terminal" with CHECKED_IN card → expect real checkout (not no-op) producing CHECKED_OUT state with fee deducted
  - Test that `handleCheckout(expiredPayload, nowSeconds)` produces `state = CHECKED_OUT`, `fee <= 24 * PARKING_RATE_PER_HOUR`, `fee <= balance`, and audit type "missed_checkout" (from Bug Condition in design: `isBugCondition_SessionExpired`)
  - Test that checkout from Station/Terminal source invokes real flow: `validateTransition` → `applyCheckout`/`applyForceCheckout` → NFC write → local DB update (from Bug Condition: `isBugCondition_CheckoutSimulation`)
  - Run test on UNFIXED code
  - **EXPECTED OUTCOME**: Test FAILS (this is correct - it proves the bugs exist: checkout is no-op, expired sessions have no auto-checkout)
  - Document counterexamples found (e.g., "handleCheckout with expired session does nothing", "onCheckout={() => {}} produces no state change")
  - Mark task complete when test is written, run, and failure is documented
  - _Requirements: 1.1, 1.6, 2.1, 2.6_

- [ ] 2. Write preservation property tests (BEFORE implementing fix)
  - **Property 2: Preservation** - Normal Sessions, Gate Mode, and Failed NFC Ops
  - **IMPORTANT**: Follow observation-first methodology
  - **Observe on UNFIXED code**:
    - Observe: `applyCheckout(payload, nowSeconds)` for non-expired sessions (< 24h) produces fee = `ceil(hoursParked) * PARKING_RATE_PER_HOUR` capped at balance, state = CHECKED_OUT
    - Observe: Gate mode check-in operations use simulation callbacks (no real state machine invocation)
    - Observe: When NFC phase = "error" or payload is null, no writes occur to `localDb.cards`
    - Observe: Cards with status BLOCKED_TAMPER or BLOCKED_FRAUD are rejected by `validateTransition`
  - Write property-based tests:
    - **P2a**: For all non-expired CardPayload (lastTimestamp within 24h), `applyCheckout` produces identical fee calculation and state transition as original function
    - **P2b**: For all gate-mode check-in operations, behavior is unchanged (simulation mode preserved)
    - **P2c**: For all failed NFC operations (phase="error", aborted, null payload), no local DB sync occurs
    - **P2d**: For all cards with non-active status, checkout is rejected with appropriate error
  - Property-based testing generates many random CardPayload configurations for stronger preservation guarantees
  - Run tests on UNFIXED code
  - **EXPECTED OUTCOME**: Tests PASS (this confirms baseline behavior to preserve)
  - Mark task complete when tests are written, run, and passing on unfixed code
  - _Requirements: 3.1, 3.2, 3.6, 3.7_

- [ ] 3. Fix Bug 1 & 6: Real Checkout with 24h Auto Force-Checkout

  - [ ] 3.1 Implement `applyForceCheckout` in state-machine engine
    - Add `applyForceCheckout(payload, nowSeconds)` function to `src/core/state-machine/engine.ts`
    - Cap fee at `min(24 * PARKING_RATE_PER_HOUR, payload.wallet.balance)`
    - Transition card state to CHECKED_OUT
    - Set `session.endTime = nowSeconds`
    - Increment counter, update lastTimestamp
    - Build log entry with `deltaTime: 0xffff` (max, capped at 24h) and `flags: TxType.CHECKOUT`
    - Export the function for use in StationSection
    - _Bug_Condition: isBugCondition_SessionExpired(input) where isSessionExpired(payload, nowSeconds) = true AND state IN {CHECKED_IN, STATION_OPERATION}_
    - _Expected_Behavior: result.wallet.state = CHECKED_OUT AND fee = min(24 * PARKING_RATE_PER_HOUR, balance) AND auditType = "missed_checkout"_
    - _Preservation: Normal checkout (non-expired) must remain unchanged; applyCheckout function untouched_
    - _Requirements: 2.1, 2.6_

  - [ ] 3.2 Implement `handleCheckout` callback in StationSection
    - Replace `onCheckout={() => {}}` with real `handleCheckout` callback in `src/components/section/StationSection.tsx`
    - Detect expired session via `isSessionExpired(payload, nowSeconds)`
    - If expired: use `force_checkout` trigger, call `applyForceCheckout`
    - If not expired: use `gate_checkout` trigger, call `applyCheckout`
    - Call `validateTransition(payload, trigger, nowSeconds)` before applying
    - Call `write(updatedPayload, operationType)` to write to NFC card
    - Record audit log entry with type "missed_checkout" for expired sessions (flagged: true)
    - Wire `handleCheckout` into `NfcScanDrawer` prop replacing the no-op
    - Remove simulation mode from Terminal checkout (keep simulation for Gate check-in only)
    - _Bug_Condition: isBugCondition_CheckoutSimulation(input) where trigger = "checkout" AND source IN {"station", "terminal"}_
    - _Expected_Behavior: validateTransition → applyCheckout/applyForceCheckout → NFC write → local DB update → audit log_
    - _Preservation: Gate check-in simulation mode must remain unchanged (requirement 3.7)_
    - _Requirements: 2.1, 2.6, 3.7_

  - [ ] 3.3 Verify bug condition exploration test now passes
    - **Property 1: Expected Behavior** - Expired Session & No-Op Checkout
    - **IMPORTANT**: Re-run the SAME test from task 1 - do NOT write a new test
    - The test from task 1 encodes the expected behavior for expired sessions and real checkout
    - When this test passes, it confirms: expired sessions auto force-checkout with 24h cap, and Station/Terminal checkout invokes real flow
    - Run bug condition exploration test from step 1
    - **EXPECTED OUTCOME**: Test PASSES (confirms bugs 1 & 6 are fixed)
    - _Requirements: 2.1, 2.6_

  - [ ] 3.4 Verify preservation tests still pass
    - **Property 2: Preservation** - Normal Sessions, Gate Mode, and Failed NFC Ops
    - **IMPORTANT**: Re-run the SAME tests from task 2 - do NOT write new tests
    - Run preservation property tests from step 2
    - **EXPECTED OUTCOME**: Tests PASS (confirms no regressions)
    - Confirm normal checkout fee calculation unchanged for non-expired sessions
    - Confirm gate simulation mode preserved
    - Confirm blocked cards still rejected
    - _Requirements: 3.1, 3.6, 3.7_

- [ ] 4. Fix Bug 2: Card Sync After NFC Operations

  - [ ] 4.1 Extract `syncCardToLocalDb` utility function
    - Create utility function in `src/components/section/StationSection.tsx` (or separate util file)
    - Function accepts `tenantId`, `cardId`, `payload: CardPayload`
    - Syncs all relevant fields: `balance`, `counter`, `status`, `lastActivityAt`
    - Maps `CardStatus` enum to local DB status string via `mapCardStatus` helper
    - Handles both update (existing card) and insert (new card) cases
    - _Bug_Condition: isBugCondition_CardSyncMissing(input) where phase IN {"ready", "success"} AND payload IS NOT NULL AND serialNumber IS NOT NULL_
    - _Expected_Behavior: localDb.cards[cardId] reflects current payload.wallet.balance, counter, status, lastActivityAt_
    - _Preservation: No sync on failed NFC operations (phase="error", null payload)_
    - _Requirements: 2.2, 3.2_

  - [ ] 4.2 Wire sync into NFC operation lifecycle
    - Enhance `useEffect` for `phase=ready` to call `syncCardToLocalDb` with full payload data
    - Enhance `useEffect` for `phase=success` to call `syncCardToLocalDb` with post-write payload
    - Ensure sync covers all NFC operation types: scan, top-up, issue, fix, checkout
    - Guard against sync when payload is null or serialNumber is missing
    - _Requirements: 2.2, 3.2_

- [ ] 5. Fix Bug 3: UI Styling Polish

  - [ ] 5.1 Standardize Lucide icon sizes across components
    - Audit all Lucide icon usages in Station, Admin, and shared components
    - Apply consistent sizing: `size={16}` inline/body, `size={20}` buttons, `size={24}` section headers, `size={40}` hero/empty states
    - Ensure consistent `strokeWidth` (default 2 for most, 1.5 for larger icons)
    - _Requirements: 2.3_

  - [ ] 5.2 Polish spacing and component hierarchy
    - Apply consistent Tailwind spacing scale: `gap-2`, `gap-3`, `gap-4`, `space-y-3`, `space-y-4`
    - Ensure cards use `rounded-2xl`, sections use `rounded-xl`, buttons use `rounded-lg`
    - Apply design tokens consistently: `type-body1`, `type-body1-bold`, `type-body2`, `type-title-bold`
    - Use `signal-bg-*`, `brand-dark` tokens for backgrounds and accents
    - _Requirements: 2.3_

- [ ] 6. Fix Bug 4: Offline Mode — Graceful Degradation

  - [ ] 6.1 Create `useOnlineStatus` hook
    - Create `src/hooks/useOnlineStatus.ts`
    - Track `navigator.onLine` state with event listeners for "online"/"offline" events
    - Return boolean indicating current connectivity status
    - Handle SSR case (default to true when navigator unavailable)
    - _Requirements: 2.4_

  - [ ] 6.2 Create `OfflineIndicator` component
    - Create `src/components/block/OfflineIndicator.tsx`
    - Use `useOnlineStatus` hook to detect offline state
    - Render fixed banner at top of viewport when offline: "Mode Offline — Data lokal digunakan"
    - Use `signal-bg-warning` background with `signal-warning` text color
    - Set `z-[60]` to appear above other UI elements
    - Return null when online (no visual impact)
    - _Requirements: 2.4_

  - [ ] 6.3 Add `OfflineIndicator` to root route and add offline fallbacks to queries
    - Add `<OfflineIndicator />` to `src/routes/__root.tsx` RootComponent
    - Add `staleTime: Infinity` to route queries when offline so cached data is used
    - Add `placeholderData` from local IndexedDB for critical queries
    - Ensure all pages render with cached data instead of showing error states when offline
    - _Requirements: 2.4, 3.3_

- [ ] 7. Fix Bug 5: PWA Hardening

  - [ ] 7.1 Harden Vite PWA configuration
    - Update `vite.config.ts` workbox config:
      - Add `skipWaiting: true` for immediate SW activation
      - Add `clientsClaim: true` so new SW takes control immediately
      - Verify `navigateFallback: "/index.html"` is set
      - Add `navigateFallbackDenylist: [/^\/api\//]` to exclude API routes
      - Set `maximumFileSizeToCacheInBytes: 5 * 1024 * 1024` (5MB)
      - Add runtime caching for API calls with NetworkFirst strategy and 5s timeout
    - _Requirements: 2.5_

  - [ ] 7.2 Harden PwaUpdatePrompt component
    - Add error handling for SW registration failure in `src/components/block/PwaUpdatePrompt.tsx`
    - Add retry logic for update checks (retry up to 3 times with exponential backoff)
    - Handle case where SW update check fails silently
    - Ensure update prompt shows reliably when new version is available
    - _Requirements: 2.5, 3.5_

  - [ ] 7.3 Harden install prompt lifecycle
    - Update `src/hooks/useInstallPrompt.ts` (or create if not exists)
    - Add `display-mode: minimal-ui` to media query check for broader browser support
    - Persist dismissal state to localStorage so prompt doesn't re-appear in same session
    - Ensure `beforeinstallprompt` event is captured reliably
    - _Requirements: 2.5_

- [ ] 8. Checkpoint - Ensure all tests pass
  - Run full test suite: `pnpm test --run`
  - Verify bug condition exploration test (Property 1) passes after fix
  - Verify preservation property tests (Property 2) still pass after all fixes
  - Verify no TypeScript compilation errors: `pnpm tsc --noEmit`
  - Verify no lint errors: `pnpm lint`
  - Manually verify offline indicator appears when network is disabled
  - Manually verify PWA install prompt and update mechanism work
  - Ensure all tests pass, ask the user if questions arise
