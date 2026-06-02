# CardSection Hooks

This directory contains custom hooks that split the CardSection component's functionality into logical, reusable parts.

## Hooks Overview

### 1. `useCardDrawers`

**Purpose**: Manages all drawer and dialog states for the CardSection component.

**Responsibilities**:

- Drawer open/close states (topup, recovery, fix, issue)
- Conflict dialog states (overwrite, not blank)
- Helper functions to open/close drawers

**Exports**:

- States: `isDrawerOpen`, `topupDrawerOpen`, `recoveryDrawerOpen`, `fixCardId`, `showFixCard`, `issueCardDrawerOpen`, `overwriteDialog`, `notBlankDialog`
- Actions: `openTopupDrawer`, `closeTopupDrawer`, `openRecoveryDrawer`, `closeRecoveryDrawer`, `openFixCard`, `closeFixCard`, `openIssueCardDrawer`, `closeIssueCardDrawer`

---

### 2. `useCardData`

**Purpose**: Manages data queries for cards and members.

**Responsibilities**:

- Fetches card data with user information
- Fetches member/user data
- Handles loading states

**Exports**:

- `cards`: Query result for station cards
- `members`: Query result for users/members

---

### 3. `useCardIssuance`

**Purpose**: Handles the complete card issuance flow with NFC.

**Responsibilities**:

- Card issuance mutation with NFC scanning
- Issuance phase management (idle, scanning, writing, done, error)
- Conflict handling (overwrite, not blank)
- NFC session lifecycle management
- Auto-cleanup and auto-close after success

**Exports**:

- States: `issuancePhase`, `issuanceError`, `issuancePayload`, `issueCardDrawerPhase`, `isIssuing`
- Actions: `handleIssueCard`, `handleIssuanceDrawerClose`, `handleRetryIssuance`, `handleForceOverwriteConfirm`, `cleanupIssuanceSession`

**Key Features**:

- Manages NFC reader, abort controller, and timeout refs
- Handles force overwrite scenarios
- Integrates with conflict dialogs

---

### 4. `useCardRecovery`

**Purpose**: Handles card recovery operations (restoring card data from server).

**Responsibilities**:

- Card recovery mutation with NFC writing
- Recovery phase management (idle, scanning, writing, done, error)
- Recovery drawer lifecycle
- Retry logic

**Exports**:

- States: `recoveryPhase`, `recoveryError`, `recoveryPayload`, `recoverySerial`, `recoveryTargetCardId`, `isRecovering`
- Actions: `startCardRecovery`, `handleRecoveryDrawerClose`, `handleRetryRecovery`

---

### 5. `useCardOperations`

**Purpose**: Handles card CRUD operations and NFC interactions.

**Responsibilities**:

- Card deletion (soft delete)
- Card fixing (manual data correction)
- Top-up flow with validation
- Reset card operation
- NFC state management (scan, write, reset, cancel)

**Exports**:

- States: `state` (NFC state), `resetCardPending`
- Mutations: `deleteCard`, `fixCard`
- Actions: `handleTopupCard`, `handleTopupConfirm`, `handleResetWrite`, `scan`, `reset`, `cancel`, `retryScan`

**Key Features**:

- Validates scanned card matches selected card
- Checks for blocked cards/users before topup
- Auto-triggers reset write when card is ready

---

### 6. `useCardSync`

**Purpose**: Manages synchronization effects between NFC state and local database.

**Responsibilities**:

- Auto-sync card data to local DB after successful NFC operations
- Auto-sync card data when scanned (ready phase)
- Auto-close drawers after success
- Trigger sync engine notifications

**Exports**: None (side-effect only hook)

**Key Features**:

- Normalizes serial numbers to consistent hex format
- Updates local DB with latest card data
- Invalidates queries to refresh UI
- Handles reset card status updates

---

## Usage Example

```tsx
import {
  useCardDrawers,
  useCardData,
  useCardIssuance,
  useCardRecovery,
  useCardOperations,
  useCardSync,
} from "#/hooks/useCardSection";

function CardSection({ tenantId, accountId, deviceId, terminalId }) {
  const { grant } = useSessionGrant(tenantId, accountId, deviceId);

  // Drawer states
  const {
    isDrawerOpen,
    topupDrawerOpen,
    // ... other drawer states
    openTopupDrawer,
    closeTopupDrawer,
    // ... other drawer actions
  } = useCardDrawers();

  // Card data
  const { cards, members } = useCardData(tenantId);

  // Card operations
  const {
    state,
    deleteCard,
    fixCard,
    handleTopupCard,
    // ... other operations
  } = useCardOperations({
    tenantId,
    grant,
    terminalId,
    onOpenTopupDrawer: openTopupDrawer,
    onCloseDrawer: () => {
      setIsDrawerOpen(false);
      closeTopupDrawer();
    },
  });

  // Card issuance
  const {
    issuancePhase,
    handleIssueCard,
    // ... other issuance functions
  } = useCardIssuance({
    tenantId,
    grant,
    onOpenDrawer: openIssueCardDrawer,
    onCloseDrawer: closeIssueCardDrawer,
    onShowOverwriteDialog: setOverwriteDialog,
    onShowNotBlankDialog: setNotBlankDialog,
  });

  // Card recovery
  const {
    recoveryPhase,
    startCardRecovery,
    // ... other recovery functions
  } = useCardRecovery({
    tenantId,
    grant,
    onOpenDrawer: openRecoveryDrawer,
    onCloseDrawer: closeRecoveryDrawer,
  });

  // Sync effects
  useCardSync({
    tenantId,
    state,
    resetCardPending,
    onResetState: () => {
      reset();
      setResetCardPending(false);
    },
    onCloseDrawers: () => {
      setIsDrawerOpen(false);
      closeTopupDrawer();
    },
  });

  // ... rest of component
}
```

## Benefits of This Architecture

1. **Separation of Concerns**: Each hook handles a specific domain of functionality
2. **Reusability**: Hooks can be reused in other components if needed
3. **Testability**: Each hook can be tested independently
4. **Maintainability**: Easier to locate and modify specific functionality
5. **Readability**: Component code is cleaner and more focused on UI composition
6. **Type Safety**: Each hook has well-defined TypeScript interfaces

## File Structure

```
src/hooks/useCardSection/
├── index.ts                  # Barrel export
├── useCardDrawers.ts         # Drawer state management
├── useCardData.ts            # Data queries
├── useCardIssuance.ts        # Card issuance flow
├── useCardRecovery.ts        # Card recovery flow
├── useCardOperations.ts      # CRUD operations
├── useCardSync.ts            # Sync effects
└── README.md                 # This file
```

## Migration Notes

The original `CardSection.tsx` component was ~600+ lines with complex state management. After migration:

- Component reduced to ~300 lines (50% reduction)
- Logic split into 6 focused hooks
- All functionality preserved
- No breaking changes to component API
- All TypeScript types maintained
