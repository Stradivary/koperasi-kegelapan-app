import { pbkdf2Sync, randomBytes, timingSafeEqual } from "node:crypto";
import { randomUUID } from "node:crypto";
import { createHmac } from "node:crypto";

export function hashPassword(password: string): string {
  const salt = randomBytes(16).toString("hex");
  const hash = pbkdf2Sync(password, salt, 310_000, 32, "sha256").toString("hex");
  return `pbkdf2$${salt}$${hash}`;
}

export function verifyPassword(password: string, stored: string): boolean {
  const parts = stored.split("$");
  if (parts.length !== 3 || parts[0] !== "pbkdf2") return false;
  const [, salt, hash] = parts;
  const computed = pbkdf2Sync(password, salt, 310_000, 32, "sha256").toString("hex");
  try {
    return timingSafeEqual(Buffer.from(hash, "hex"), Buffer.from(computed, "hex"));
  } catch {
    return false;
  }
}

export function generateId(): string {
  return randomUUID();
}

export function generateSessionKey(): Buffer {
  return randomBytes(32);
}

export function signGrantPayload(payload: Record<string, unknown>, secret: Buffer): string {
  const data = JSON.stringify(payload);
  return createHmac("sha256", secret).update(data).digest("base64url");
}

export function nowSeconds(): number {
  return Math.floor(Date.now() / 1000);
}
