/**
 * Tests for NFC Card Crypto module
 * Covers: 5.1 (AES-GCM), 5.2 (HMAC-SHA256), 5.12 (dual-key decryption)
 */

import { describe, it, expect } from 'vitest'
import * as fc from 'fast-check'
import {
  encrypt,
  decrypt,
  importKey,
  importHMACKey,
  generateHMAC,
  verifyHMAC,
  decryptWithKeyRotation,
} from './crypto.ts'

// Helper: generate a random 256-bit key as base64
async function generateTestKeyBase64(): Promise<string> {
  const key = crypto.getRandomValues(new Uint8Array(32))
  return btoa(String.fromCharCode(...key))
}

// ─── 5.1: AES-GCM Encryption / Decryption ──────────────────────────────────

describe('AES-GCM encryption and decryption (5.1)', () => {
  it('importKey imports a base64 key for AES-GCM', async () => {
    const base64Key = await generateTestKeyBase64()
    const cryptoKey = await importKey(base64Key)
    expect(cryptoKey).toBeDefined()
    expect(cryptoKey.algorithm).toMatchObject({ name: 'AES-GCM' })
  })

  it('encrypt returns IV + ciphertext (IV is 12 bytes)', async () => {
    const base64Key = await generateTestKeyBase64()
    const key = await importKey(base64Key)
    const plaintext = new Uint8Array([1, 2, 3, 4, 5])

    const encrypted = await encrypt(plaintext, key)

    // Must be longer than plaintext (12 IV + 16 auth tag + plaintext)
    expect(encrypted.length).toBeGreaterThan(plaintext.length)
    // At minimum: 12 (IV) + plaintext.length + 16 (auth tag)
    expect(encrypted.length).toBe(12 + plaintext.length + 16)
  })

  it('decrypt recovers the original plaintext', async () => {
    const base64Key = await generateTestKeyBase64()
    const key = await importKey(base64Key)
    const plaintext = new Uint8Array([10, 20, 30, 40, 50])

    const encrypted = await encrypt(plaintext, key)
    const decrypted = await decrypt(encrypted, key)

    expect(decrypted).toEqual(plaintext)
  })

  it('decrypt fails with wrong key', async () => {
    const key1 = await importKey(await generateTestKeyBase64())
    const key2 = await importKey(await generateTestKeyBase64())
    const plaintext = new Uint8Array([1, 2, 3])

    const encrypted = await encrypt(plaintext, key1)

    await expect(decrypt(encrypted, key2)).rejects.toThrow()
  })

  it('decrypt fails with tampered ciphertext', async () => {
    const key = await importKey(await generateTestKeyBase64())
    const plaintext = new Uint8Array([1, 2, 3, 4])

    const encrypted = await encrypt(plaintext, key)
    // Tamper with a byte in the ciphertext portion (after IV)
    encrypted[15] ^= 0xff

    await expect(decrypt(encrypted, key)).rejects.toThrow()
  })

  it('each encryption produces different ciphertext (random IV)', async () => {
    const key = await importKey(await generateTestKeyBase64())
    const plaintext = new Uint8Array([1, 2, 3])

    const enc1 = await encrypt(plaintext, key)
    const enc2 = await encrypt(plaintext, key)

    // IVs should differ (extremely unlikely to collide)
    const iv1 = enc1.slice(0, 12)
    const iv2 = enc2.slice(0, 12)
    expect(iv1).not.toEqual(iv2)
  })

  /**
   * Property: Encryption round-trip
   * **Validates: Requirements 7.1**
   */
  it('property: encrypt then decrypt is identity for any payload', async () => {
    const base64Key = await generateTestKeyBase64()
    const key = await importKey(base64Key)

    await fc.assert(
      fc.asyncProperty(
        fc.uint8Array({ minLength: 1, maxLength: 200 }),
        async (data) => {
          const encrypted = await encrypt(data, key)
          const decrypted = await decrypt(encrypted, key)
          expect(decrypted).toEqual(data)
        },
      ),
      { numRuns: 50 },
    )
  })
})

// ─── 5.2: HMAC-SHA256 ──────────────────────────────────────────────────────

describe('HMAC-SHA256 hash generation and verification (5.2)', () => {
  it('importHMACKey imports a base64 key for HMAC', async () => {
    const base64Key = await generateTestKeyBase64()
    const hmacKey = await importHMACKey(base64Key)
    expect(hmacKey).toBeDefined()
  })

  it('generateHMAC produces a 32-byte hash', async () => {
    const hmacKey = await importHMACKey(await generateTestKeyBase64())
    const data = new Uint8Array([1, 2, 3, 4, 5])

    const hash = await generateHMAC(data, hmacKey)

    expect(hash.length).toBe(32)
  })

  it('verifyHMAC returns true for valid hash', async () => {
    const hmacKey = await importHMACKey(await generateTestKeyBase64())
    const data = new Uint8Array([10, 20, 30])

    const hash = await generateHMAC(data, hmacKey)
    const valid = await verifyHMAC(data, hash, hmacKey)

    expect(valid).toBe(true)
  })

  it('verifyHMAC returns false for tampered data', async () => {
    const hmacKey = await importHMACKey(await generateTestKeyBase64())
    const data = new Uint8Array([10, 20, 30])

    const hash = await generateHMAC(data, hmacKey)
    const tamperedData = new Uint8Array([10, 20, 31])
    const valid = await verifyHMAC(tamperedData, hash, hmacKey)

    expect(valid).toBe(false)
  })

  it('verifyHMAC returns false for tampered hash', async () => {
    const hmacKey = await importHMACKey(await generateTestKeyBase64())
    const data = new Uint8Array([10, 20, 30])

    const hash = await generateHMAC(data, hmacKey)
    const tamperedHash = new Uint8Array(hash)
    tamperedHash[0] ^= 0xff
    const valid = await verifyHMAC(data, tamperedHash, hmacKey)

    expect(valid).toBe(false)
  })

  it('verifyHMAC returns false with wrong key', async () => {
    const key1 = await importHMACKey(await generateTestKeyBase64())
    const key2 = await importHMACKey(await generateTestKeyBase64())
    const data = new Uint8Array([1, 2, 3])

    const hash = await generateHMAC(data, key1)
    const valid = await verifyHMAC(data, hash, key2)

    expect(valid).toBe(false)
  })

  /**
   * Property: HMAC round-trip verification
   * **Validates: Requirements 7.2, 7.3**
   */
  it('property: generateHMAC then verifyHMAC always succeeds for same data', async () => {
    const hmacKey = await importHMACKey(await generateTestKeyBase64())

    await fc.assert(
      fc.asyncProperty(
        fc.uint8Array({ minLength: 1, maxLength: 200 }),
        async (data) => {
          const hash = await generateHMAC(data, hmacKey)
          const valid = await verifyHMAC(data, hash, hmacKey)
          expect(valid).toBe(true)
        },
      ),
      { numRuns: 50 },
    )
  })
})

// ─── 5.12: Dual-Key Decryption ─────────────────────────────────────────────

describe('Dual-key decryption for key rotation (5.12)', () => {
  it('decrypts with active key when it matches', async () => {
    const activeKey = await importKey(await generateTestKeyBase64())
    const rotatingKey = await importKey(await generateTestKeyBase64())
    const plaintext = new Uint8Array([1, 2, 3])

    const encrypted = await encrypt(plaintext, activeKey)
    const decrypted = await decryptWithKeyRotation(
      encrypted,
      activeKey,
      rotatingKey,
    )

    expect(decrypted).toEqual(plaintext)
  })

  it('falls back to rotating key when active key fails', async () => {
    const activeKey = await importKey(await generateTestKeyBase64())
    const rotatingKey = await importKey(await generateTestKeyBase64())
    const plaintext = new Uint8Array([4, 5, 6])

    // Encrypt with the rotating key (simulating old card data)
    const encrypted = await encrypt(plaintext, rotatingKey)
    const decrypted = await decryptWithKeyRotation(
      encrypted,
      activeKey,
      rotatingKey,
    )

    expect(decrypted).toEqual(plaintext)
  })

  it('throws when both keys fail', async () => {
    const activeKey = await importKey(await generateTestKeyBase64())
    const rotatingKey = await importKey(await generateTestKeyBase64())
    const wrongKey = await importKey(await generateTestKeyBase64())
    const plaintext = new Uint8Array([7, 8, 9])

    const encrypted = await encrypt(plaintext, wrongKey)

    await expect(
      decryptWithKeyRotation(encrypted, activeKey, rotatingKey),
    ).rejects.toThrow('Card integrity check failed')
  })

  it('throws when active key fails and no rotating key', async () => {
    const activeKey = await importKey(await generateTestKeyBase64())
    const wrongKey = await importKey(await generateTestKeyBase64())
    const plaintext = new Uint8Array([1, 2])

    const encrypted = await encrypt(plaintext, wrongKey)

    await expect(
      decryptWithKeyRotation(encrypted, activeKey, null),
    ).rejects.toThrow('Card integrity check failed')
  })
})
