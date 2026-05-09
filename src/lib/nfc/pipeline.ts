/**
 * Web NFC Integration Layer — Card Operation Pipeline
 *
 * Orchestrates the full card operation flow:
 *   read → split encrypted+HMAC → verify HMAC → decrypt (dual-key) →
 *   deserialize → migrate schema → run operation → serialize →
 *   encrypt → generate HMAC → write → handle write failure
 *
 * This is the main entry point for all card operations (check-in,
 * check-out, top-up). It ties together the NFC reader/writer,
 * card crypto, serialization, migration, and safety modules.
 *
 * Requirements: 4.1, 5.1, 6.1, 7.1, 7.2
 */

import { HMAC_SHA256_SIZE } from '#/lib/card/types.ts'
import type { TenantCardConfig } from '#/lib/card/types.ts'
import {
  verifyHMAC,
  decryptWithKeyRotation,
  encrypt,
  generateHMAC,
} from '#/lib/card/crypto.ts'
import { serialize, deserialize } from '#/lib/card/serialization.ts'
import { migrateSchema } from '#/lib/card/migration.ts'
import { readNfcCard } from './reader.ts'
import { writeNfcCard } from './writer.ts'
import { safeWrite } from './safety.ts'
import type {
  CardOperationFn,
  CardCryptoKeys,
  PipelineResult,
} from './types.ts'

/**
 * Execute a full card operation pipeline.
 *
 * Steps:
 * 1. Read NFC card payload
 * 2. Split encrypted data from HMAC hash (last 32 bytes)
 * 3. Verify HMAC hash
 * 4. Decrypt payload (with dual-key support for rotation)
 * 5. Deserialize binary data to CardPayload
 * 6. Run schema migration if needed
 * 7. Call the provided operation function (check-in, check-out, or top-up)
 * 8. Serialize the updated payload
 * 9. Encrypt the updated payload
 * 10. Generate new HMAC hash
 * 11. Write encrypted data + HMAC back to card
 * 12. On write failure, abort and discard transaction
 *
 * @param operation - The card operation to perform (check-in, check-out, top-up)
 * @param config - Tenant card configuration
 * @param keys - Encryption and HMAC keys
 * @param options.signal - Optional AbortSignal to cancel the operation
 * @param options.discardTransaction - Optional callback to discard a queued transaction on write failure
 * @returns PipelineResult with the operation outcome
 */
export async function executeCardPipeline(
  operation: CardOperationFn,
  config: TenantCardConfig,
  keys: CardCryptoKeys,
  options?: {
    signal?: AbortSignal
    discardTransaction?: () => Promise<void>
  },
): Promise<PipelineResult> {
  // Step 1: Read NFC card
  const readResult = await readNfcCard({ signal: options?.signal })
  if (!readResult.success) {
    return {
      success: false,
      error: readResult.error,
      code: readResult.code,
    }
  }

  const rawData = readResult.data

  // Step 2: Split encrypted data from HMAC hash (last 32 bytes)
  if (rawData.length <= HMAC_SHA256_SIZE) {
    return {
      success: false,
      error: 'Card data is too short to contain a valid payload.',
      code: 'INVALID_CARD_DATA',
    }
  }

  const encryptedData = rawData.slice(0, rawData.length - HMAC_SHA256_SIZE)
  const hmacHash = rawData.slice(rawData.length - HMAC_SHA256_SIZE)

  // Step 3: Verify HMAC hash
  const hmacValid = await verifyHMAC(encryptedData, hmacHash, keys.hmacKey)
  if (!hmacValid) {
    return {
      success: false,
      error: 'Card integrity check failed — possible tampering detected.',
      code: 'HMAC_VERIFICATION_FAILED',
    }
  }

  // Step 4: Decrypt payload (with dual-key support for key rotation)
  let decryptedData: Uint8Array
  try {
    decryptedData = await decryptWithKeyRotation(
      encryptedData,
      keys.encryptionKey,
      keys.rotatingEncryptionKey,
    )
  } catch {
    return {
      success: false,
      error: 'Card integrity check failed — possible tampering detected.',
      code: 'DECRYPTION_FAILED',
    }
  }

  // Step 5: Deserialize binary data to CardPayload
  let payload
  try {
    payload = deserialize(decryptedData)
  } catch {
    return {
      success: false,
      error: 'Card data is corrupted and cannot be read.',
      code: 'DESERIALIZATION_FAILED',
    }
  }

  // Step 6: Run schema migration if needed
  try {
    payload = migrateSchema(payload)
  } catch (err: unknown) {
    const message =
      err instanceof Error ? err.message : 'Schema migration failed.'
    return {
      success: false,
      error: message,
      code: 'SCHEMA_MIGRATION_FAILED',
    }
  }

  // Step 7: Call the provided operation function
  const operationResult = operation(payload, config)
  if (!operationResult.success) {
    return {
      success: false,
      error: operationResult.error,
      code: operationResult.code,
    }
  }

  // Step 8: Serialize the updated payload
  const serialized = serialize(operationResult.payload)

  // Step 9: Encrypt the updated payload (always with the active key)
  const encrypted = await encrypt(serialized, keys.encryptionKey)

  // Step 10: Generate new HMAC hash
  const newHmac = await generateHMAC(encrypted, keys.hmacKey)

  // Step 11: Combine encrypted data + HMAC for writing
  const writePayload = new Uint8Array(encrypted.length + newHmac.length)
  writePayload.set(encrypted, 0)
  writePayload.set(newHmac, encrypted.length)

  // Step 12: Write to card with safety handling
  const writeResult = await safeWrite(
    () => writeNfcCard(writePayload, { signal: options?.signal }),
    options?.discardTransaction,
  )

  if (!writeResult.success) {
    return {
      success: false,
      error: `Transaction aborted: ${writeResult.error}`,
      code: writeResult.code,
    }
  }

  return {
    success: true,
    transaction: operationResult,
  }
}
