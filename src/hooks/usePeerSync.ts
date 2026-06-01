// src/hooks/usePeerSync.ts
export {
  notifyCheckin,
  verifyCheckinSynced,
  forcePushBeforeRead,
  setActiveTenantId,
  registerTriggerSync,
  peerSyncCoordinator,
} from "#/lib/peerSyncCoordinator";
export type { PeerSyncStatus, PeerSyncCoordinator } from "#/lib/peerSyncCoordinator";
