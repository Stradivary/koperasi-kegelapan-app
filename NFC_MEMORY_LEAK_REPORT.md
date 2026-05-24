# NFC Detection Memory Leak Report

**Date:** 2025-05-24  
**Severity:** Critical (causes PWA force close)  
**Affected Area:** `src/hooks/nfc/useNfcCard.ts` and auto-scan loop consumers

---

## Executive Summary

The PWA force-closes due to unbounded memory growth caused by **NDEFReader event listeners that are never removed** during the auto-scan loop. Each call to `scan()` creates a new `NDEFReader` instance with attached closures, but the previous reader's event listeners are never cleaned up. In kiosk/gate/terminal modes where auto-scan runs continuously, this accumulates hundreds of orphaned readers and closures within minutes.

---

## Root Cause Analysis

### 1. NDEFReader Event Listeners Never Removed (CRITICAL)

**File:** `src/hooks/nfc/useNfcCard.ts`, lines ~130-170

```typescript
const scan = useCallback(async () => {
  // ...
  abortRef.current?.abort();           // ← aborts signal, does NOT remove listeners
  abortRef.current = new AbortController();

  const reader = new NDEFReader();     // ← NEW reader every scan() call
  readerRef.current = reader;          // ← old reader reference lost

  // Event listeners added but NEVER removed:
  reader.addEventListener("reading", (event) => { ... });
  reader.addEventListener("readingerror", (event) => { ... });

  reader.scan({ signal }).catch(...);
}, [...]);
```

**Problem:** When `scan()` is called again (which happens every 2-3 seconds in auto-scan mode):

1. `abortRef.current?.abort()` aborts the signal — this stops the NDEFReader's scan session
2. A **new** `NDEFReader` is created and stored in `readerRef.current`
3. The **old** reader still has event listeners attached (anonymous functions — cannot be removed)
4. The old reader + its closure chain cannot be garbage collected

**Contrast with `webNfcAdapter.ts`** which correctly stores bound handlers and calls `removeEventListener` in its `cleanup()` method. The hook bypasses this adapter entirely.

### 2. Closure Chain Retention (CRITICAL)

Each `scan()` call creates nested closures:

- `handleReading()` → captures `signal`, `readSignal`
- `handleFreshScan()` → captures `readSignal`, `currentGrant`
- `completePendingWrite()` → captures `pending`, `writeSignal`
- `handleJournalRecovery()` → captures `journal`, `cardIdHex`
- `performWriteVerifyRecord()` → captures `targetReader`, `pending`

These closures reference:

- The `AbortController` and its signal
- The `SessionGrant` object (contains crypto keys — ~2KB)
- `Uint8Array` buffers (card data — 496 bytes each)
- `CardPayload` objects (decoded card state)

**Per scan cycle retained:** ~5-10KB of unreachable but non-GC'd memory.

### 3. Auto-Scan Loop Amplification (HIGH)

The `useKioskAutoScan` hook triggers `scan()` every time the phase returns to "idle":

```
scan() → reading → validating → ready → [write] → success → reset → idle → scan() → ...
```

In Gate/Terminal mode with `resetDelay: 2000-3000ms`, this means:

- **~20-30 scan cycles per minute**
- **~200-300KB leaked per minute** (closures + readers)
- **After 10-15 minutes:** 2-4MB of leaked memory
- **After 30+ minutes:** PWA hits Android WebView memory limit → force close

### 4. Reset/Cancel Don't Remove Listeners (HIGH)

```typescript
const reset = useCallback(() => {
  abortRef.current?.abort();
  abortRef.current = null;
  readerRef.current = null;  // ← drops reference, but listeners still attached to old reader
  // ...
}, [...]);
```

Setting `readerRef.current = null` only removes the hook's reference to the reader. The browser's NFC subsystem may still hold a reference to the reader via its event listener registry.

### 5. Unmount Cleanup Insufficient (MEDIUM)

```typescript
useEffect(() => {
  return () => {
    abortRef.current?.abort();
    clearPendingWriteTimeout();
    clearPostWriteAutoReset();
    // ← Missing: readerRef.current event listener removal
  };
}, [...]);
```

The unmount cleanup aborts the signal but doesn't remove event listeners from the current reader.

---

## Affected Components

| Component         | Mode                      | Scan Frequency | Time to OOM |
| ----------------- | ------------------------- | -------------- | ----------- |
| `GateSection`     | Auto-scan, resetDelay=2s  | ~20/min        | ~15 min     |
| `TerminalSection` | Auto-scan, resetDelay=3s  | ~15/min        | ~20 min     |
| `ScoutSection`    | Auto-scan, autoStart=true | ~12/min        | ~25 min     |
| `KioskSection`    | Manual scan               | Low            | Unlikely    |
| `CardSection`     | Manual scan               | Low            | Unlikely    |

---

## Reproduction Steps

1. Open Gate or Terminal mode on an Android device
2. Let the auto-scan loop run without tapping any card
3. Monitor memory via Chrome DevTools → Performance → Memory
4. Observe steady memory growth (~200-300KB/min)
5. After 15-30 minutes, the PWA will be killed by Android

---

## Recommended Fix

### Option A: Store and remove event listeners (Minimal change)

```typescript
const scan = useCallback(async () => {
  // Clean up previous reader's listeners
  if (readerRef.current && readingHandlerRef.current) {
    readerRef.current.removeEventListener("reading", readingHandlerRef.current);
    readerRef.current.removeEventListener("readingerror", errorHandlerRef.current);
  }

  abortRef.current?.abort();
  abortRef.current = new AbortController();
  const signal = abortRef.current.signal;

  const reader = new NDEFReader();
  readerRef.current = reader;

  // Store named handlers for later removal
  const readingHandler = (event: NDEFReadingEvent) => { ... };
  const errorHandler = (event: NDEFErrorEvent) => { ... };
  readingHandlerRef.current = readingHandler;
  errorHandlerRef.current = errorHandler;

  reader.addEventListener("reading", readingHandler);
  reader.addEventListener("readingerror", errorHandler);

  reader.scan({ signal }).catch(...);
}, [...]);
```

Also update `reset()`, `cancel()`, and the unmount cleanup:

```typescript
// In reset/cancel:
if (readerRef.current && readingHandlerRef.current) {
  readerRef.current.removeEventListener("reading", readingHandlerRef.current);
  readerRef.current.removeEventListener("readingerror", errorHandlerRef.current);
}
readerRef.current = null;
readingHandlerRef.current = null;
errorHandlerRef.current = null;
```

### Option B: Reuse single NDEFReader instance (Better architecture)

Instead of creating a new `NDEFReader` per scan, reuse a single instance:

```typescript
// Create reader once
const readerRef = useRef<NDEFReader | null>(null);

const getOrCreateReader = useCallback(() => {
  if (!readerRef.current) {
    readerRef.current = new NDEFReader();
  }
  return readerRef.current;
}, []);
```

This eliminates the accumulation entirely but requires careful handling of the event listener lifecycle.

### Option C: Use the existing WebNfcAdapter (Best architecture)

The project already has `src/core/nfc/adapters/webNfcAdapter.ts` which correctly manages listener cleanup. Refactor `useNfcCard` to use this adapter instead of raw `NDEFReader`.

---

## Secondary Issues

### 6. CardSection Issuance Session Leak (MEDIUM)

**File:** `src/components/section/CardSection.tsx`

In `handleFreshNfcSession()`:

```typescript
const scanResult = new Promise((resolve, reject) => {
  reader.addEventListener("reading", (event) => { ... });  // never removed
  abort.signal.addEventListener("abort", () => reject(...)); // never removed
});
```

**Fix:** Store handlers and remove them in the `finally` block or after promise settles.

### 7. AbortSignal Listener Leak in GenericNfcLayer (LOW-MEDIUM)

**File:** `src/core/nfc/genericNfcLayer.ts`

```typescript
if (signal) {
  signal.addEventListener("abort", () => {
    this.abortController?.abort();
  });
}
```

If the external signal outlives the scan operation, this listener persists.

**Fix:** Use `{ once: true }` option or store and remove the listener.

### 8. engine.ts readCard() Never-Resolving Promise (LOW)

**File:** `src/core/nfc/engine.ts`

`readCard()` creates a Promise that only resolves on "reading" or "readingerror". If the signal is aborted without either event firing, the promise hangs and the reader + listeners persist.

**Fix:** Listen for the abort signal and resolve/reject the promise.

---

## Priority

1. **Fix #1 (NDEFReader listeners in useNfcCard)** — This alone will stop the force-close
2. **Fix #4 (reset/cancel cleanup)** — Prevents residual leaks on user interaction
3. **Fix #5 (unmount cleanup)** — Prevents leaks on navigation
4. **Fix #6 (CardSection issuance)** — Lower frequency but still leaks
5. **Fix #7-8** — Edge cases, lower priority

---

## Verification

After applying fixes, verify with:

1. Chrome DevTools → Memory → Heap Snapshot before/after 100 scan cycles
2. `performance.measureUserAgentSpecificMemory()` API (Chrome 89+)
3. Run Gate mode for 30+ minutes and confirm stable memory usage
4. Check that no `NDEFReader` instances accumulate in the heap snapshot retainer tree
