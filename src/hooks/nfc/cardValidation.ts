import {
  validateCard,
  TENANT_MISMATCH_REASON,
  UNREGISTERED_CARD_MESSAGE,
} from "../../core/nfc/pipelineEngine";
import { decodePayload } from "../../core/payload/engine";
import { isTenantBindValid } from "../../core/payload/tenantBind";
import type { SessionGrant } from "../../core/payload/types";
import { decryptRawCard } from "./cardDecryption";
import type { CardValidationResult } from "./types";

export { UNREGISTERED_CARD_MESSAGE };

/**
 * Decode and validate a raw NFC card payload.
 *
 * Handles both online (server-validated) and offline (tenant-bind only) paths.
 * Returns a discriminated result indicating ready or error state.
 */
export async function decodeAndValidateCard(
  raw: Uint8Array,
  grant: SessionGrant,
  _serialNumber: string,
  lenient: boolean,
  signal: AbortSignal,
): Promise<CardValidationResult> {
  const decodableRaw = await decryptRawCard(raw, grant);
  const payload = decodePayload(decodableRaw);
  const isOffline = typeof navigator !== "undefined" ? !navigator.onLine : false;

  // ── Offline path: only check tenant binding ────────────────────────────────
  if (isOffline) {
    if (!isTenantBindValid(payload.header.tenantBind, grant.tenantId)) {
      if (lenient) {
        return {
          phase: "ready",
          payload,
          error: null,
          tamperDetected: false,
          warning: UNREGISTERED_CARD_MESSAGE,
        };
      }
      return {
        phase: "error",
        payload: null,
        error: UNREGISTERED_CARD_MESSAGE,
        tamperDetected: false,
        warning: null,
      };
    }
    return { phase: "ready", payload, error: null, tamperDetected: false, warning: null };
  }

  // ── Online path: full server-side validation ───────────────────────────────
  const validation = await validateCard(payload, raw, grant);
  if (signal.aborted) {
    return { phase: "error", payload: null, error: null, tamperDetected: false, warning: null };
  }

  if (!validation.valid) {
    const isTenantMismatch =
      validation.reason === TENANT_MISMATCH_REASON ||
      validation.reason === UNREGISTERED_CARD_MESSAGE;
    const isTamper = validation.tamper ?? false;

    if (lenient && !isTamper) {
      const warning = isTenantMismatch
        ? UNREGISTERED_CARD_MESSAGE
        : (validation.reason ?? "Validasi gagal");
      return { phase: "ready", payload, error: null, tamperDetected: false, warning };
    }

    const error = isTenantMismatch
      ? UNREGISTERED_CARD_MESSAGE
      : (validation.reason ?? "Validasi gagal");
    return {
      phase: "error",
      payload: isTenantMismatch ? null : payload,
      error,
      tamperDetected: isTamper,
      warning: null,
    };
  }

  return { phase: "ready", payload, error: null, tamperDetected: false, warning: null };
}
