/**
 * Device fingerprint generation for multi-device authentication.
 *
 * Generates a deterministic SHA-256 hash from browser attributes to uniquely
 * identify a device/browser combination. Used during authentication to register
 * and track devices in the Device Registry.
 *
 * @module deviceFingerprint
 */

/**
 * Represents a device fingerprint with individual browser attributes and
 * a computed SHA-256 hash for identification.
 */
export interface DeviceFingerprint {
  userAgent: string;
  screenResolution: string;
  timezone: string;
  language: string;
  platform: string;
  /** SHA-256 hash of pipe-delimited attributes — deterministic 64-char hex string */
  hash: string;
}

/**
 * Generates a device fingerprint by hashing browser attributes using Web Crypto SHA-256.
 *
 * The hash is computed from the pipe-delimited concatenation of:
 * userAgent | screenResolution | timezone | language | platform
 *
 * @throws {Error} If the Web Crypto API (crypto.subtle) is unavailable in the current environment.
 * @returns A DeviceFingerprint object with individual attributes and the computed hash.
 */
export async function generateDeviceFingerprint(): Promise<DeviceFingerprint> {
  if (
    typeof crypto === "undefined" ||
    !crypto.subtle ||
    typeof crypto.subtle.digest !== "function"
  ) {
    throw new Error(
      "Web Crypto API is not available. Your browser does not support the required security features for device authentication."
    );
  }

  const userAgent = navigator.userAgent;
  const screenResolution = `${screen.width}x${screen.height}`;
  const timezone = Intl.DateTimeFormat().resolvedOptions().timeZone;
  const language = navigator.language;
  const platform = navigator.platform;

  const raw = [userAgent, screenResolution, timezone, language, platform].join(
    "|"
  );

  const encoded = new TextEncoder().encode(raw);
  const hashBuffer = await crypto.subtle.digest("SHA-256", encoded);
  const hash = Array.from(new Uint8Array(hashBuffer))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");

  return {
    userAgent,
    screenResolution,
    timezone,
    language,
    platform,
    hash,
  };
}
