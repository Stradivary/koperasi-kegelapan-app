import { useState, useCallback } from "react";
import { reconciliationOutbox } from "../lib/indexeddb";
import { API_BASE_URL } from "../lib/api";

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
      // Strip internal outbox fields before sending to server
      const events = pending.map((e) => ({
        tenantId: e.tenantId,
        cardId: e.cardId,
        counter: e.counter,
        type: e.type,
        amount: e.amount,
        balanceAfter: e.balanceAfter,
        timestamp: e.timestamp,
        hash: e.hash,
        idempotencyKey: e.idempotencyKey,
      }));

      const res = await fetch(`${API_BASE_URL}/api/reconcile`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ terminalId, events }),
      });

      if (!res.ok) {
        const text = await res.text().catch(() => "");
        let msg = `Reconciliation failed: ${res.status}`;
        try {
          const errBody = JSON.parse(text);
          if (errBody.error) msg = errBody.error;
        } catch {
          if (text) msg += ` — ${text.slice(0, 100)}`;
        }
        throw new Error(msg);
      }

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
