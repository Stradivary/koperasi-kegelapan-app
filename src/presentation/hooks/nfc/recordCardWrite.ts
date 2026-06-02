import type { CardPayload } from "#/core/payload/types";
import { getIndexedDb } from "#/infrastructure/persistence/dexie/indexeddb.lazy";
import { recordTransaction } from "#/infrastructure/persistence/dexie/transactionLogService";
import { updateLocalCardRecord, updateLocalUserFromCard } from "./updateLocalCardRecord";

type TransactionOperationType = "debit" | "credit" | "checkin" | "checkout" | "topup" | "admin";

interface RecordCardWriteParams {
  tenantId: string;
  terminalId: number;
  operationType: string;
  currentPayload: CardPayload;
  updatedPayload: CardPayload;
  cardName: string | null;
}

/**
 * Record a completed card write to the reconciliation outbox and transaction log.
 * The transaction log write is non-critical - failures are silently swallowed.
 *
 * IMPORTANT: This must only be called AFTER write verification succeeds to avoid
 * phantom transactions in the outbox.
 */
export async function recordCardWrite({
  tenantId,
  terminalId,
  operationType,
  currentPayload,
  updatedPayload,
  cardName,
}: RecordCardWriteParams): Promise<void> {
  const cardIdHex = Array.from(updatedPayload.header.cardId)
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
  const lastHash = Array.from(updatedPayload.logEntries.at(-1)?.hash ?? new Uint8Array(4))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
  const balanceDiff = currentPayload.wallet.balance - updatedPayload.wallet.balance;

  // Use updatedPayload timestamp, fallback to current time if 0 (defensive)
  const timestamp =
    updatedPayload.wallet.lastTimestamp > 0
      ? updatedPayload.wallet.lastTimestamp
      : Math.floor(Date.now() / 1000);

  const { reconciliationOutbox, makeIdempotencyKey } = await getIndexedDb();

  await reconciliationOutbox.add({
    tenantId,
    terminalId,
    cardId: cardIdHex,
    counter: Number(updatedPayload.wallet.counter),
    type: operationType,
    amount: balanceDiff,
    balanceAfter: updatedPayload.wallet.balance,
    timestamp,
    hash: lastHash,
    idempotencyKey: makeIdempotencyKey(tenantId, cardIdHex, Number(updatedPayload.wallet.counter)),
  });

  try {
    await recordTransaction({
      tenantId,
      cardId: cardIdHex,
      userId: updatedPayload.identity.userId ? updatedPayload.identity.userId : null,
      cardName,
      counter: Number(updatedPayload.wallet.counter),
      type: operationType as TransactionOperationType,
      amount: Math.abs(balanceDiff),
      balanceAfter: updatedPayload.wallet.balance,
      timestamp,
      hash: lastHash,
      terminalId,
      deviceId: null,
    });
  } catch {
    /* Non-critical - transaction log is best-effort */
  }

  // Update local card and user records with latest state from the written card.
  // This ensures local DB always reflects the physical card state (balance, counter,
  // status) for accurate blocked-status checks and data recovery without server sync.
  await updateLocalCardRecord(tenantId, updatedPayload);
  await updateLocalUserFromCard(tenantId, updatedPayload);
}
