// @vitest-environment jsdom
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { generateDeviceFingerprint } from "#/infrastructure/device/fingerprint";

describe("generateDeviceFingerprint", () => {
  const mockUserAgent = "Mozilla/5.0 (Linux; Android 13) AppleWebKit/537.36";
  const mockScreenWidth = 1920;
  const mockScreenHeight = 1080;
  const mockTimezone = "Asia/Jakarta";
  const mockLanguage = "id-ID";
  const mockPlatform = "Linux armv8l";

  beforeEach(() => {
    Object.defineProperty(navigator, "userAgent", {
      value: mockUserAgent,
      configurable: true,
    });
    Object.defineProperty(navigator, "language", {
      value: mockLanguage,
      configurable: true,
    });
    Object.defineProperty(navigator, "platform", {
      value: mockPlatform,
      configurable: true,
    });
    Object.defineProperty(screen, "width", {
      value: mockScreenWidth,
      configurable: true,
    });
    Object.defineProperty(screen, "height", {
      value: mockScreenHeight,
      configurable: true,
    });

    // Mock Intl.DateTimeFormat to return a consistent timezone
    vi.spyOn(Intl, "DateTimeFormat").mockImplementation(
      () =>
        ({
          resolvedOptions: () => ({ timeZone: mockTimezone }),
        }) as unknown as Intl.DateTimeFormat,
    );
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("returns a DeviceFingerprint with all expected attributes", async () => {
    const fp = await generateDeviceFingerprint();

    expect(fp.userAgent).toBe(mockUserAgent);
    expect(fp.screenResolution).toBe(`${mockScreenWidth}x${mockScreenHeight}`);
    expect(fp.timezone).toBe(mockTimezone);
    expect(fp.language).toBe(mockLanguage);
    expect(fp.platform).toBe(mockPlatform);
    expect(fp.hash).toBeDefined();
  });

  it("produces a 64-character hexadecimal hash", async () => {
    const fp = await generateDeviceFingerprint();

    expect(fp.hash).toHaveLength(64);
    expect(fp.hash).toMatch(/^[0-9a-f]{64}$/);
  });

  it("produces a deterministic hash for the same inputs", async () => {
    const fp1 = await generateDeviceFingerprint();
    const fp2 = await generateDeviceFingerprint();

    expect(fp1.hash).toBe(fp2.hash);
  });

  it("produces different hashes for different inputs", async () => {
    const fp1 = await generateDeviceFingerprint();

    // Change one attribute
    Object.defineProperty(navigator, "language", {
      value: "en-US",
      configurable: true,
    });

    const fp2 = await generateDeviceFingerprint();

    expect(fp1.hash).not.toBe(fp2.hash);
  });

  it("throws an error when Web Crypto API is unavailable", async () => {
    const originalCrypto = globalThis.crypto;

    // Simulate missing crypto.subtle
    Object.defineProperty(globalThis, "crypto", {
      value: { subtle: undefined },
      configurable: true,
    });

    await expect(generateDeviceFingerprint()).rejects.toThrow("Web Crypto API is not available");

    // Restore
    Object.defineProperty(globalThis, "crypto", {
      value: originalCrypto,
      configurable: true,
    });
  });

  it("uses pipe delimiter between attributes in hash input", async () => {
    // Verify the hash matches what we'd expect from pipe-delimited concatenation
    const raw = [
      mockUserAgent,
      `${mockScreenWidth}x${mockScreenHeight}`,
      mockTimezone,
      mockLanguage,
      mockPlatform,
    ].join("|");

    const encoded = new TextEncoder().encode(raw);
    const hashBuffer = await crypto.subtle.digest("SHA-256", encoded);
    const expectedHash = Array.from(new Uint8Array(hashBuffer))
      .map((b) => b.toString(16).padStart(2, "0"))
      .join("");

    const fp = await generateDeviceFingerprint();
    expect(fp.hash).toBe(expectedHash);
  });
});
