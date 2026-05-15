import { useState, useCallback } from "react";
import { reconciliationOutbox } from "../lib/indexeddb";

export type ReconciliationStatus = "idle" | "syncing" | "success" | "error";

export function useReconciliation(tenantId: string, terminalId: number) {
  const [status, setStatus] = useState<ReconciliationStatus>("idle");
  const [error, setError] = useState<string | null>(null);
  const [lastSyncedAt, setLastSyncedAt] = useState<number | null>(null);
  const [pendingCount, setPendingCount] = useState(0);

  const checkPending = useCallback(async () => {
    const pending = await reconciliationOutbox.getPending(tenantId);
    setPendingCount(pending.length);
    return pending.length;
  }, [tenantId]);

  const sync = useCallback(async () => {
    const pending = await reconciliationOutbox.getPending(tenantId);
    if (pending.length === 0) {
      setStatus("success");
      return;
    }

    setStatus("syncing");
    setError(null);

    try {
      const res = await fetch("/api/reconcile", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ terminalId, events: pending }),
      });

      if (!res.ok) throw new Error(`Reconciliation failed: ${res.status}`);

      const data = await res.json();

      await Promise.all(pending.map((e) => reconciliationOutbox.markSynced(e.idempotencyKey)));

      setLastSyncedAt(Date.now());
      setStatus("success");
      setPendingCount(0);

      if (data.flags?.length > 0) {
        // eslint-disable-next-line no-console
        console.warn("Reconciliation flags:", data.flags);
      }
    } catch (e) {
      setError(String(e));
      setStatus("error");
    }
  }, [tenantId, terminalId]);

  return { status, error, lastSyncedAt, pendingCount, sync, checkPending };
}
