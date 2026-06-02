// src/hooks/usePeerSync.ts
export {
  notifyCheckin,
  verifyCheckinSynced,
  forcePushBeforeRead,
  setActiveTenantId,
  registerTriggerSync,
  peerSyncCoordinator,
} from "#/infrastructure/sync/peerSyncCoordinator";
export type {
  PeerSyncStatus,
  PeerSyncCoordinator,
} from "#/infrastructure/sync/peerSyncCoordinator";
