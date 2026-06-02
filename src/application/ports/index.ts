// ============================================================================
// Application Ports (Interfaces)
// ============================================================================
// Contracts that infrastructure adapters must implement.
// Domain interfaces live in src/core/interfaces/.
// Application-level gateway interfaces live here.
// ============================================================================

// Example:
// export interface ISyncGateway {
//   push(tenantId: string, payload: PushBatchPayload): Promise<SyncPushResponse>;
//   pull(tenantId: string, cursors: Record<string, string>): Promise<PullEntityResponse>;
// }
//
// export interface ISessionGrantStore {
//   get(tenantId: string): Promise<SessionGrant | null>;
//   save(grant: SessionGrant): Promise<void>;
// }
