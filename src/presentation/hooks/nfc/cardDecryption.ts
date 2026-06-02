import { decryptCardBody } from "#/core/nfc/pipelineEngine";
import { decodePayload } from "#/core/payload/engine";
import type { CardPayload, SessionGrant } from "#/core/payload/types";
import { BUFFER_SIZE, WIRE_SIZE, TRAILER_COUNTER_BIND } from "#/core/payload/types";

/**
 * Decrypt and reassemble a raw NFC card buffer if version >= 2.
 * Returns the decodable (plaintext) buffer.
 */
export async function decryptRawCard(raw: Uint8Array, grant: SessionGrant): Promise<Uint8Array> {
  const version = raw[4];
  if (version < 2) return raw;

  const trailerView = new DataView(raw.buffer, raw.byteOffset + BUFFER_SIZE);
  const counterBind = trailerView.getUint32(TRAILER_COUNTER_BIND, true);
  const cardId = raw.slice(6, 12);

  const decryptedBuf = await decryptCardBody(
    raw.slice(0, BUFFER_SIZE),
    grant.sessionKey,
    cardId,
    BigInt(counterBind),
  );

  const full = new Uint8Array(WIRE_SIZE);
  full.set(decryptedBuf, 0);
  full.set(raw.slice(BUFFER_SIZE), BUFFER_SIZE);
  return full;
}

/**
 * Decrypt raw card bytes and decode into a CardPayload.
 * Used during write verification to compare expected vs actual.
 */
export async function decodeCardPayloadForVerification(
  raw: Uint8Array,
  grant: SessionGrant,
): Promise<CardPayload> {
  return decodePayload(await decryptRawCard(raw, grant));
}
