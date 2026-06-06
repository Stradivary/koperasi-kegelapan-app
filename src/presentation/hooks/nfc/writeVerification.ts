import { extractCardBytes } from "#/core/nfc/engine";
import { encodePayloadWire } from "#/core/payload/engine";
import type { CardPayload, SessionGrant } from "#/core/payload/types";
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
    diff |= left[index] ^ right[index];
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
 * Verify the card data from a single reading event against the expected payload.
 * Throws if the data doesn't match.
 */
async function verifyReadingEvent(
  event: NDEFReadingEvent,
  expectedPayload: CardPayload,
  grant: SessionGrant,
): Promise<void> {
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
}

interface VerificationContext {
  settled: boolean;
  timeout: ReturnType<typeof setTimeout>;
  abort: AbortController;
  resolve: () => void;
  reject: (reason: Error) => void;
}

function finishVerification(ctx: VerificationContext, callback: () => void): void {
  if (ctx.settled) return;
  ctx.settled = true;
  clearTimeout(ctx.timeout);
  ctx.abort.abort();
  callback();
}

function handleReadingEvent(
  event: NDEFReadingEvent,
  expectedPayload: CardPayload,
  grant: SessionGrant,
  ctx: VerificationContext,
): void {
  verifyReadingEvent(event, expectedPayload, grant)
    .then(() => finishVerification(ctx, ctx.resolve))
    .catch((e) =>
      finishVerification(ctx, () =>
        ctx.reject(e instanceof Error ? e : new Error(WRITE_VERIFICATION_FAILED_MESSAGE)),
      ),
    );
}

function handleReadingError(ctx: VerificationContext): void {
  finishVerification(ctx, () => ctx.reject(new Error(WRITE_VERIFICATION_FAILED_MESSAGE)));
}

function handleScanError(ctx: VerificationContext): void {
  if (ctx.settled || ctx.abort.signal.aborted) return;
  finishVerification(ctx, () => ctx.reject(new Error(WRITE_VERIFICATION_FAILED_MESSAGE)));
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
    const ctx: VerificationContext = {
      settled: false,
      timeout: setTimeout(
        () => finishVerification(ctx, () => reject(new Error(WRITE_VERIFICATION_FAILED_MESSAGE))),
        VERIFICATION_TIMEOUT_MS,
      ),
      abort: verificationAbort,
      resolve,
      reject,
    };

    const verificationReader = new NDEFReader();

    verificationReader.addEventListener("reading", (event: NDEFReadingEvent) => {
      handleReadingEvent(event, expectedPayload, grant, ctx);
    });

    verificationReader.addEventListener("readingerror", () => {
      handleReadingError(ctx);
    });

    verificationReader.scan({ signal: verificationAbort.signal }).catch(() => {
      handleScanError(ctx);
    });
  });
}
