import { extractCardBytes } from "../../core/nfc/engine";
import { encodePayloadWire } from "../../core/payload/engine";
import type { CardPayload, SessionGrant } from "../../core/payload/types";
import { decodeCardPayloadForVerification } from "./cardDecryption";
import {
  WRITE_VERIFICATION_FAILED_MESSAGE,
  VERIFICATION_TIMEOUT_MS,
  MAX_VERIFICATION_RETRIES,
} from "./types";

/**
 * Constant-time comparison of two Uint8Arrays.
 * Prevents timing attacks on card payload verification.
 */
function arraysEqual(left: Uint8Array, right: Uint8Array): boolean {
  if (left.length !== right.length) return false;

  let diff = 0;
  for (let index = 0; index < left.length; index += 1) {
    diff |= left[index]! ^ right[index]!;
  }

  return diff === 0;
}

/**
 * Verify that the written payload matches what we expect by reading back from the card.
 * Retries up to MAX_VERIFICATION_RETRIES times before rejecting.
 */
export async function verifyWrittenPayload(
  expectedPayload: CardPayload,
  grant: SessionGrant,
): Promise<void> {
  let lastError: Error | null = null;

  for (let attempt = 0; attempt <= MAX_VERIFICATION_RETRIES; attempt++) {
    try {
      await verifyWrittenPayloadOnce(expectedPayload, grant);
      return;
    } catch (e) {
      lastError = e instanceof Error ? e : new Error(String(e));
      if (attempt < MAX_VERIFICATION_RETRIES) {
        await new Promise((resolve) => setTimeout(resolve, 300));
      }
    }
  }

  throw lastError ?? new Error(WRITE_VERIFICATION_FAILED_MESSAGE);
}

/**
 * Single attempt to verify the written payload by reading back from the card.
 */
async function verifyWrittenPayloadOnce(
  expectedPayload: CardPayload,
  grant: SessionGrant,
): Promise<void> {
  const verificationAbort = new AbortController();

  return new Promise<void>((resolve, reject) => {
    const verificationReader = new NDEFReader();
    let settled = false;

    const finish = (callback: () => void) => {
      if (settled) return;
      settled = true;
      clearTimeout(verificationTimeout);
      verificationAbort.abort();
      callback();
    };

    const verificationTimeout = setTimeout(() => {
      finish(() => reject(new Error(WRITE_VERIFICATION_FAILED_MESSAGE)));
    }, VERIFICATION_TIMEOUT_MS);

    verificationReader.addEventListener("reading", (event: NDEFReadingEvent) => {
      void (async () => {
        const raw = extractCardBytes(event.message);
        if (!raw) {
          throw new Error(WRITE_VERIFICATION_FAILED_MESSAGE);
        }

        const actualPayload = await decodeCardPayloadForVerification(raw, grant);
        const payloadMatches = arraysEqual(
          encodePayloadWire(actualPayload),
          encodePayloadWire(expectedPayload),
        );

        if (!payloadMatches) {
          throw new Error(WRITE_VERIFICATION_FAILED_MESSAGE);
        }
      })()
        .then(() => finish(resolve))
        .catch((e) =>
          finish(() =>
            reject(e instanceof Error ? e : new Error(WRITE_VERIFICATION_FAILED_MESSAGE)),
          ),
        );
    });

    verificationReader.addEventListener("readingerror", () => {
      finish(() => reject(new Error(WRITE_VERIFICATION_FAILED_MESSAGE)));
    });

    verificationReader.scan({ signal: verificationAbort.signal }).catch(() => {
      if (settled || verificationAbort.signal.aborted) return;
      finish(() => reject(new Error(WRITE_VERIFICATION_FAILED_MESSAGE)));
    });
  });
}
