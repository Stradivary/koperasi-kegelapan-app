import type { UIDCheckResult } from "./types";

export interface UIDRemoteValidator {
  /**
   * Check if a UID exists in any tenant via network API.
   * Throws on network failure (caller handles fail-closed behavior).
   */
  checkUIDExists(normalizedUID: string): Promise<UIDCheckResult>;
}
