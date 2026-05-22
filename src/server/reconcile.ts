import { getDb } from "#/infrastructure/persistence/drizzle/index";
import {
  processReconciliation as _processReconciliation,
  type ReconcileEvent,
  type ReconcileResult,
} from "#/application/sync/reconcile.usecase";

export type {
  ReconcileEvent,
  ReconcileResult,
  ReconcileFlag,
  ReconcileRequest,
} from "#/application/sync/reconcile.usecase";

export async function processReconciliation(body: {
  terminalId: number;
  events: ReconcileEvent[];
}): Promise<ReconcileResult> {
  return _processReconciliation(getDb(), body);
}
