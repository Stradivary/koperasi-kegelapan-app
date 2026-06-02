import { getDb } from "#/infrastructure/persistence/drizzle";
import {
  processReconciliation as _processReconciliation,
  type ReconcileEvent,
  type ReconcileResult,
} from "./reconcile.usecase";

export type {
  ReconcileEvent,
  ReconcileResult,
  ReconcileFlag,
  ReconcileRequest,
} from "./reconcile.usecase";

export async function processReconciliation(body: {
  terminalId: number;
  events: ReconcileEvent[];
}): Promise<ReconcileResult> {
  return _processReconciliation(getDb(), body);
}
