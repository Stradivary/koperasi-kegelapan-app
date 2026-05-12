const ENC = new TextEncoder()

function ab(u8: Uint8Array): ArrayBuffer {
  const buf = new ArrayBuffer(u8.byteLength)
  new Uint8Array(buf).set(u8)
  return buf
}

async function hkdf(
  keyMaterial: Uint8Array,
  salt: Uint8Array,
  info: string,
  length: number,
): Promise<Uint8Array> {
  const base = await crypto.subtle.importKey('raw', ab(keyMaterial), 'HKDF', false, ['deriveBits'])
  const bits = await crypto.subtle.deriveBits(
    { name: 'HKDF', hash: 'SHA-256', salt: ab(salt), info: ENC.encode(info) },
    base,
    length * 8,
  )
  return new Uint8Array(bits)
}

export async function deriveEncryptionKey(
  sessionKey: Uint8Array,
  cardId: Uint8Array,
): Promise<CryptoKey> {
  const keyBytes = await hkdf(sessionKey, cardId, 'enc', 32)
  return crypto.subtle.importKey('raw', ab(keyBytes), { name: 'AES-GCM' }, false, [
    'encrypt',
    'decrypt',
  ])
}

export async function deriveAuthKey(
  sessionKey: Uint8Array,
  cardId: Uint8Array,
): Promise<CryptoKey> {
  const keyBytes = await hkdf(sessionKey, cardId, 'auth', 32)
  return crypto.subtle.importKey('raw', ab(keyBytes), { name: 'HMAC', hash: 'SHA-256' }, false, [
    'sign',
    'verify',
  ])
}

export async function deriveNonce(
  sessionKey: Uint8Array,
  cardId: Uint8Array,
  counter: bigint,
): Promise<Uint8Array> {
  const counterBytes = new Uint8Array(8)
  new DataView(counterBytes.buffer).setBigUint64(0, counter, true)
  const salt = new Uint8Array(cardId.length + 8)
  salt.set(cardId)
  salt.set(counterBytes, cardId.length)
  return hkdf(sessionKey, salt, 'nonce', 12)
}

export async function encryptBuffer(
  sessionKey: Uint8Array,
  cardId: Uint8Array,
  counter: bigint,
  plaintext: Uint8Array,
): Promise<Uint8Array> {
  const [key, nonce] = await Promise.all([
    deriveEncryptionKey(sessionKey, cardId),
    deriveNonce(sessionKey, cardId, counter),
  ])
  const ct = await crypto.subtle.encrypt({ name: 'AES-GCM', iv: ab(nonce) }, key, ab(plaintext))
  return new Uint8Array(ct)
}

export async function decryptBuffer(
  sessionKey: Uint8Array,
  cardId: Uint8Array,
  counter: bigint,
  ciphertext: Uint8Array,
): Promise<Uint8Array> {
  const [key, nonce] = await Promise.all([
    deriveEncryptionKey(sessionKey, cardId),
    deriveNonce(sessionKey, cardId, counter),
  ])
  const pt = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: ab(nonce) }, key, ab(ciphertext))
  return new Uint8Array(pt)
}

export async function computeHmac(
  sessionKey: Uint8Array,
  cardId: Uint8Array,
  data: Uint8Array,
): Promise<Uint8Array> {
  const authKey = await deriveAuthKey(sessionKey, cardId)
  const sig = await crypto.subtle.sign('HMAC', authKey, ab(data))
  return new Uint8Array(sig).slice(0, 8)
}

export async function verifyHmac(
  sessionKey: Uint8Array,
  cardId: Uint8Array,
  data: Uint8Array,
  expected: Uint8Array,
): Promise<boolean> {
  const computed = await computeHmac(sessionKey, cardId, data)
  if (computed.length !== expected.length) return false
  let diff = 0
  for (let i = 0; i < computed.length; i++) diff |= computed[i] ^ expected[i]
  return diff === 0
}

export async function computeChainHash(
  deltaTime: number,
  amount: number,
  balanceAfter: number,
  flags: number,
  prevHash: Uint8Array,
): Promise<Uint8Array> {
  const data = new Uint8Array(16)
  const view = new DataView(data.buffer)
  view.setUint16(0, deltaTime, true)
  data[2] = amount & 0xff
  data[3] = (amount >> 8) & 0xff
  data[4] = (amount >> 16) & 0xff
  view.setUint32(5, balanceAfter, true)
  data[9] = flags
  data.set(prevHash.slice(0, 6), 10)
  const hash = await crypto.subtle.digest('SHA-256', data.buffer)
  return new Uint8Array(hash).slice(0, 6)
}

export async function sha256(data: Uint8Array): Promise<Uint8Array> {
  const hash = await crypto.subtle.digest('SHA-256', ab(data))
  return new Uint8Array(hash)
}
