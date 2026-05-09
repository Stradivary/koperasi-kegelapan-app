/**
 * NFC Card Operations — Cryptographic Functions
 *
 * AES-GCM encryption/decryption and HMAC-SHA256 hash generation/verification
 * for card payload security. Uses the Web Crypto API exclusively.
 *
 * Requirements: 7.1, 7.2, 7.3, 7.4
 */

import { AES_GCM_IV_SIZE } from './types.ts'

// ─── AES-GCM Encryption (Requirement 7.1) ───────────────────────────────────

/**
 * Import a base64-encoded key material as a CryptoKey for AES-GCM operations.
 *
 * @param base64KeyMaterial - Base64-encoded 256-bit key
 * @returns CryptoKey usable for encrypt/decrypt
 */
export async function importKey(
  base64KeyMaterial: string,
): Promise<CryptoKey> {
  const rawKey = base64ToUint8Array(base64KeyMaterial)
  return crypto.subtle.importKey('raw', rawKey, { name: 'AES-GCM' }, false, [
    'encrypt',
    'decrypt',
  ])
}

/**
 * Encrypt a payload using AES-GCM with a random IV.
 * Returns IV (12 bytes) prepended to the ciphertext.
 *
 * @param payload - Plaintext bytes to encrypt
 * @param key - AES-GCM CryptoKey
 * @returns Uint8Array of [IV (12 bytes) | ciphertext]
 */
export async function encrypt(
  payload: Uint8Array,
  key: CryptoKey,
): Promise<Uint8Array> {
  const iv = crypto.getRandomValues(new Uint8Array(AES_GCM_IV_SIZE))
  const ciphertext = await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv },
    key,
    payload,
  )
  const result = new Uint8Array(iv.length + ciphertext.byteLength)
  result.set(iv, 0)
  result.set(new Uint8Array(ciphertext), iv.length)
  return result
}

/**
 * Decrypt an AES-GCM encrypted payload. Expects IV prepended to ciphertext.
 *
 * @param encrypted - Uint8Array of [IV (12 bytes) | ciphertext]
 * @param key - AES-GCM CryptoKey
 * @returns Decrypted plaintext bytes
 * @throws Error if decryption fails (wrong key or tampered data)
 */
export async function decrypt(
  encrypted: Uint8Array,
  key: CryptoKey,
): Promise<Uint8Array> {
  const iv = encrypted.slice(0, AES_GCM_IV_SIZE)
  const ciphertext = encrypted.slice(AES_GCM_IV_SIZE)
  const plaintext = await crypto.subtle.decrypt(
    { name: 'AES-GCM', iv },
    key,
    ciphertext,
  )
  return new Uint8Array(plaintext)
}

// ─── HMAC-SHA256 (Requirements 7.2, 7.3) ────────────────────────────────────

/**
 * Import a base64-encoded key material as a CryptoKey for HMAC-SHA256 operations.
 *
 * @param base64KeyMaterial - Base64-encoded key
 * @returns CryptoKey usable for sign/verify
 */
export async function importHMACKey(
  base64KeyMaterial: string,
): Promise<CryptoKey> {
  const rawKey = base64ToUint8Array(base64KeyMaterial)
  return crypto.subtle.importKey(
    'raw',
    rawKey,
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign', 'verify'],
  )
}

/**
 * Generate an HMAC-SHA256 hash for the given data.
 *
 * @param data - Data to hash
 * @param key - HMAC CryptoKey
 * @returns 32-byte HMAC hash
 */
export async function generateHMAC(
  data: Uint8Array,
  key: CryptoKey,
): Promise<Uint8Array> {
  const signature = await crypto.subtle.sign('HMAC', key, data)
  return new Uint8Array(signature)
}

/**
 * Verify an HMAC-SHA256 hash against the given data.
 * Uses constant-time comparison via Web Crypto API.
 *
 * @param data - Original data
 * @param hash - Expected HMAC hash (32 bytes)
 * @param key - HMAC CryptoKey
 * @returns true if the hash is valid
 */
export async function verifyHMAC(
  data: Uint8Array,
  hash: Uint8Array,
  key: CryptoKey,
): Promise<boolean> {
  return crypto.subtle.verify('HMAC', key, hash, data)
}

// ─── Dual-Key Decryption (Requirement 7.4) ──────────────────────────────────

/**
 * Attempt decryption with the active key first, then fall back to the
 * rotating key during key rotation periods.
 *
 * @param encrypted - Encrypted payload (IV + ciphertext)
 * @param activeKey - Current active CryptoKey
 * @param rotatingKey - Previous/rotating CryptoKey (null if not in rotation)
 * @returns Decrypted plaintext bytes
 * @throws Error if both keys fail to decrypt
 */
export async function decryptWithKeyRotation(
  encrypted: Uint8Array,
  activeKey: CryptoKey,
  rotatingKey: CryptoKey | null,
): Promise<Uint8Array> {
  try {
    return await decrypt(encrypted, activeKey)
  } catch {
    if (rotatingKey) {
      try {
        return await decrypt(encrypted, rotatingKey)
      } catch {
        throw new Error(
          'Card integrity check failed — possible tampering detected.',
        )
      }
    }
    throw new Error(
      'Card integrity check failed — possible tampering detected.',
    )
  }
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

/**
 * Convert a base64 string to Uint8Array.
 */
function base64ToUint8Array(base64: string): Uint8Array {
  const binaryString = atob(base64)
  const bytes = new Uint8Array(binaryString.length)
  for (let i = 0; i < binaryString.length; i++) {
    bytes[i] = binaryString.charCodeAt(i)
  }
  return bytes
}
