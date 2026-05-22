import { describe, it, expect } from "vitest";
import {
  hashPassword,
  verifyPassword,
  generateId,
  generateSessionKey,
  signGrantPayload,
  nowSeconds,
} from "../auth";

describe("auth", () => {
  describe("hashPassword", () => {
    it("returns a pbkdf2-formatted hash string", () => {
      const hash = hashPassword("mypassword");
      expect(hash).toMatch(/^pbkdf2\$[a-f0-9]+\$[a-f0-9]+$/);
    });

    it("produces different hashes for the same password (random salt)", () => {
      const h1 = hashPassword("same");
      const h2 = hashPassword("same");
      expect(h1).not.toBe(h2);
    });

    it("salt is 32 hex chars (16 bytes)", () => {
      const hash = hashPassword("test");
      const salt = hash.split("$")[1];
      expect(salt.length).toBe(32);
    });

    it("hash is 64 hex chars (32 bytes)", () => {
      const hash = hashPassword("test");
      const hashPart = hash.split("$")[2];
      expect(hashPart.length).toBe(64);
    });
  });

  describe("verifyPassword", () => {
    it("returns true for correct password (pbkdf2 format)", () => {
      const stored = hashPassword("correct");
      expect(verifyPassword("correct", stored)).toBe(true);
    });

    it("returns false for incorrect password (pbkdf2 format)", () => {
      const stored = hashPassword("correct");
      expect(verifyPassword("wrong", stored)).toBe(false);
    });

    it("returns false for malformed stored hash (pbkdf2 with wrong parts)", () => {
      expect(verifyPassword("test", "pbkdf2$onlyonepart")).toBe(false);
    });

    it("handles client-side hash format (iterations:salt:hash)", () => {
      // Generate a known hash using pbkdf2 with 100000 iterations
      const { pbkdf2Sync } = require("node:crypto");
      const salt = Buffer.from("abcdef0123456789", "hex");
      const hash = pbkdf2Sync("mypass", salt, 100000, 32, "sha256").toString("hex");
      const stored = `100000:abcdef0123456789:${hash}`;
      expect(verifyPassword("mypass", stored)).toBe(true);
    });

    it("returns false for client-side format with wrong password", () => {
      const { pbkdf2Sync } = require("node:crypto");
      const salt = Buffer.from("abcdef0123456789", "hex");
      const hash = pbkdf2Sync("mypass", salt, 100000, 32, "sha256").toString("hex");
      const stored = `100000:abcdef0123456789:${hash}`;
      expect(verifyPassword("wrongpass", stored)).toBe(false);
    });

    it("returns false for client-side format with invalid iterations", () => {
      expect(verifyPassword("test", "abc:abcdef:abcdef")).toBe(false);
    });

    it("returns false for client-side format with zero iterations", () => {
      expect(verifyPassword("test", "0:abcdef:abcdef")).toBe(false);
    });

    it("returns false for completely unrecognized format", () => {
      expect(verifyPassword("test", "randomgarbage")).toBe(false);
    });

    it("caps iterations at 100000 for client-side format", () => {
      // Even with very high iterations in stored value, should still work (capped)
      const { pbkdf2Sync } = require("node:crypto");
      const salt = Buffer.from("abcdef0123456789", "hex");
      // Compute with capped iterations (100000)
      const hash = pbkdf2Sync("mypass", salt, 100000, 32, "sha256").toString("hex");
      // Store with higher iterations value — should be capped to 100000
      const stored = `200000:abcdef0123456789:${hash}`;
      expect(verifyPassword("mypass", stored)).toBe(true);
    });
  });

  describe("generateId", () => {
    it("returns a valid UUID string", () => {
      const id = generateId();
      expect(id).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/);
    });

    it("generates unique IDs", () => {
      const ids = new Set(Array.from({ length: 100 }, () => generateId()));
      expect(ids.size).toBe(100);
    });
  });

  describe("generateSessionKey", () => {
    it("returns a 32-byte Buffer", () => {
      const key = generateSessionKey();
      expect(Buffer.isBuffer(key)).toBe(true);
      expect(key.length).toBe(32);
    });

    it("generates unique keys", () => {
      const k1 = generateSessionKey();
      const k2 = generateSessionKey();
      expect(k1.equals(k2)).toBe(false);
    });
  });

  describe("signGrantPayload", () => {
    it("returns a base64url-encoded string", () => {
      const secret = generateSessionKey();
      const sig = signGrantPayload({ foo: "bar" }, secret);
      expect(typeof sig).toBe("string");
      expect(sig.length).toBeGreaterThan(0);
      // base64url chars only
      expect(sig).toMatch(/^[A-Za-z0-9_-]+$/);
    });

    it("produces consistent signatures for same input", () => {
      const secret = Buffer.from("a".repeat(32));
      const payload = { key: "value", num: 42 };
      const s1 = signGrantPayload(payload, secret);
      const s2 = signGrantPayload(payload, secret);
      expect(s1).toBe(s2);
    });

    it("produces different signatures for different payloads", () => {
      const secret = generateSessionKey();
      const s1 = signGrantPayload({ a: 1 }, secret);
      const s2 = signGrantPayload({ a: 2 }, secret);
      expect(s1).not.toBe(s2);
    });

    it("produces different signatures for different secrets", () => {
      const payload = { x: "y" };
      const s1 = signGrantPayload(payload, generateSessionKey());
      const s2 = signGrantPayload(payload, generateSessionKey());
      expect(s1).not.toBe(s2);
    });
  });

  describe("nowSeconds", () => {
    it("returns current time in seconds (integer)", () => {
      const now = nowSeconds();
      expect(Number.isInteger(now)).toBe(true);
      expect(now).toBeGreaterThan(1700000000); // After 2023
      expect(now).toBeLessThan(2000000000); // Before 2033
    });

    it("is close to Date.now() / 1000", () => {
      const now = nowSeconds();
      const expected = Math.floor(Date.now() / 1000);
      expect(Math.abs(now - expected)).toBeLessThanOrEqual(1);
    });
  });
});
