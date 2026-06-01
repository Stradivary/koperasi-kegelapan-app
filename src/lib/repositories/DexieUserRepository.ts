import type { UserRepository } from "#/core/interfaces/UserRepository";
import type { UserRecord } from "#/core/interfaces/types";
import { localDb } from "#/db/local-db";

export class DexieUserRepository implements UserRepository {
  async getByTenantAndUserId(tenantId: string, userId: string): Promise<UserRecord | undefined> {
    const user = await localDb.users.get([tenantId, userId]);
    if (!user) return undefined;
    return { tenantId: user.tenantId, userId: user.userId, name: user.name, status: user.status };
  }
}
