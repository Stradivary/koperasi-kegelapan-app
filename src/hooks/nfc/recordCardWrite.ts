import type { CardPayload } from "../../core/payload/types";
import { reconciliationOutbox, makeIdempotencyKey } from "../../lib/indexeddb";
import { recordTransaction } from "../../lib/transactionLogService";

type TransactionOperationType = "debit" | "credit" | "checkin" | "checkout" | "topup" | "admin";

interface RecordCardWriteParams {
  tenantId: string;
  terminalId: number;
  operationType: string;
  currentPayload: CardPayload;
  updatedPayload: CardPayload;
}

/**
 * Record a completed card write to the reconciliation outbox and transaction log.
 * The transaction log write is non-critical — failures are silently swallowed.
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
}: RecordCardWriteParams): Promise<void> {
  const cardIdHex = Array.from(updatedPayload.header.cardId)
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
  const lastHash = Array.from(updatedPayload.logEntries.at(-1)?.hash ?? new Uint8Array(6))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
  const amount = currentPayload.wallet.balance - updatedPayload.wallet.balance;

  await reconciliationOutbox.add({
    tenantId,
    terminalId,
    cardId: cardIdHex,
    counter: Number(updatedPayload.wallet.counter),
    type: operationType,
    amount,
    balanceAfter: updatedPayload.wallet.balance,
    timestamp: updatedPayload.wallet.lastTimestamp,
    hash: lastHash,
    idempotencyKey: makeIdempotencyKey(tenantId, cardIdHex, Number(updatedPayload.wallet.counter)),
  });

  try {
    await recordTransaction({
      tenantId,
      cardId: cardIdHex,
      userId: updatedPayload.identity.userId ? updatedPayload.identity.userId : null,
      counter: Number(updatedPayload.wallet.counter),
      type: operationType as TransactionOperationType,
      amount: Math.abs(amount),
      balanceAfter: updatedPayload.wallet.balance,
      timestamp: updatedPayload.wallet.lastTimestamp,
      hash: lastHash,
      terminalId,
      deviceId: null,
    });
  } catch {
    /* Non-critical — transaction log is best-effort */
  }
}
