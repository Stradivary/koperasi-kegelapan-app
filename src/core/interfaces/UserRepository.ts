import type { UserRecord } from "./types";

export interface UserRepository {
  /**
   * Get a single user by compound key [tenantId, userId].
   * Returns undefined if not found.
   */
  getByTenantAndUserId(tenantId: string, userId: string): Promise<UserRecord | undefined>;
}
