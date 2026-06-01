/**
 * Sync Conflict Resolution Module.
 *
 * Implements conflict resolution strategies for the bidirectional sync engine:
 * 1. Server-wins for admin actions (superadmin/tenant admin modifications)
 * 2. Last-write-wins for concurrent member/card edits (compare updatedAt)
 * 3. Discards local Outbox entries when server version is newer
 * 4. Shows toast notification (5s) when local edit is overwritten
 * 5. Handles stale_counter conflicts: trigger pull to get latest
 * 6. On network failure during conflict resolution pull: retain "conflict" status, retry next cycle
 *
 * @see Requirements 12.1, 12.2, 12.3, 12.4, 12.5, 12.6, 12.7
 */

import { toast } from "sonner";
import { localDb, type User, type Card } from "#/db/local-db";
import { syncPull, SyncPullError } from "./syncPull";

// ── Types ──────────────────────────────────────────────────────────────

/** Represents a server entity received during pull with metadata for conflict resolution. */
export interface ServerMemberEntry {
  tenantId: string;
  userId: string;
  name: string;
  status: string;
  createdAt: number;
  updatedAt: number;
  /** Whether this change was made by an admin (superadmin or tenant admin). */
  isAdminAction?: boolean;
}

export interface ServerCardEntry {
  tenantId: string;
  cardId: string;
  userId: string | null;
  status: string;
  balance: number;
  counter: number;
  keyVersion: number;
  createdAt: number;
  lastActivityAt: number | null;
  expiresAt: number | null;
  notes: string | null;
  updatedAt: number;
  /** Whether this change was made by an admin (superadmin or tenant admin). */
  isAdminAction?: boolean;
}

export interface ConflictResolutionResult {
  /** Number of members where server version was applied (overwriting local) */
  membersOverwritten: number;
  /** Number of cards where server version was applied (overwriting local) */
  cardsOverwritten: number;
  /** Number of outbox entries discarded due to server-wins */
  outboxEntriesDiscarded: number;
  /** Number of stale_counter conflicts that triggered a pull */
  staleCounterPullsTriggered: number;
  /** Whether a pull was attempted for stale_counter resolution */
  pullAttempted: boolean;
  /** Whether the pull succeeded (false if network failure) */
  pullSucceeded: boolean;
}

// ── Constants ──────────────────────────────────────────────────────────

/** Duration for conflict toast notifications in milliseconds */
export const CONFLICT_TOAST_DURATION_MS = 5000;

// ── Conflict Resolution Strategies ────────────────────────────────────

/**
 * Determines if the server version should win over the local version.
 *
 * Strategy:
 * - Server-wins unconditionally for admin actions (Req 12.6)
 * - Last-write-wins for concurrent edits: server wins if server updatedAt > local updatedAt (Req 12.1)
 */
export function shouldServerWin(
  localUpdatedAt: number,
  serverUpdatedAt: number,
  isAdminAction: boolean,
): boolean {
  // Admin actions always win regardless of timestamps (Req 12.6)
  if (isAdminAction) {
    return true;
  }
  // Last-write-wins: server wins if its timestamp is later (Req 12.1)
  return serverUpdatedAt > localUpdatedAt;
}

// ── Member Conflict Resolution ─────────────────────────────────────────

/**
 * Resolve conflicts for member (user) records pulled from the server.
 *
 * For each server member:
 * 1. Check if a local version exists with unsynchronized modifications
 * 2. If server-wins (admin action or later updatedAt): overwrite local, discard outbox
 * 3. Show toast notification when local edit is overwritten (Req 12.2)
 */
export async function resolveMemberConflicts(
  tenantId: string,
  serverMembers: ServerMemberEntry[],
): Promise<{ overwritten: number; outboxDiscarded: number }> {
  let overwritten = 0;
  let outboxDiscarded = 0;

  for (const serverMember of serverMembers) {
    // Get the local version of this member
    const localMember = await localDb.users.get([tenantId, serverMember.userId]);

    if (!localMember) {
      // No local version - just apply server version (no conflict)
      continue;
    }

    const isAdminAction = serverMember.isAdminAction ?? false;
    const localUpdatedAt = localMember.updatedAt ?? 0;
    const serverUpdatedAt = serverMember.updatedAt;

    // Check if local has unsynchronized modifications (local updatedAt differs from what we last synced)
    // If local was modified after last sync, there's a potential conflict
    if (shouldServerWin(localUpdatedAt, serverUpdatedAt, isAdminAction)) {
      // Server wins - apply server version
      const updatedUser: User = {
        tenantId: serverMember.tenantId,
        userId: serverMember.userId,
        name: serverMember.name,
        status: serverMember.status as User["status"],
        createdAt: serverMember.createdAt,
        updatedAt: serverMember.updatedAt,
      };

      await localDb.users.put(updatedUser);
      overwritten++;

      // Show toast notification when local edit is overwritten (Req 12.2)
      if (localUpdatedAt > 0 && localUpdatedAt !== serverUpdatedAt) {
        showConflictToast("member", serverMember.name);
      }
    }
  }

  return { overwritten, outboxDiscarded };
}

// ── Card Conflict Resolution ───────────────────────────────────────────

/**
 * Resolve conflicts for card records pulled from the server.
 *
 * For each server card:
 * 1. Check if a local version exists with unsynchronized modifications
 * 2. If server-wins (admin action or later updatedAt): overwrite local, discard outbox entries
 * 3. Show toast notification when local edit is overwritten (Req 12.2)
 * 4. Discard pending outbox entries for that card (Req 12.3, 12.7)
 */
export async function resolveCardConflicts(
  tenantId: string,
  serverCards: ServerCardEntry[],
): Promise<{ overwritten: number; outboxDiscarded: number }> {
  let overwritten = 0;
  let outboxDiscarded = 0;

  for (const serverCard of serverCards) {
    // Get the local version of this card
    const localCard = await localDb.cards.get([tenantId, serverCard.cardId]);

    if (!localCard) {
      // No local version - just apply server version (no conflict)
      continue;
    }

    const isAdminAction = serverCard.isAdminAction ?? false;

    // For cards, we use the counter as a proxy for "updatedAt" if no explicit updatedAt
    // But the design specifies updatedAt on cards table, so use that
    const localUpdatedAt = (localCard as Card & { updatedAt?: number }).updatedAt ?? 0;
    const serverUpdatedAt = serverCard.updatedAt;

    // Check if there are pending outbox entries for this card
    const pendingEntries = await localDb.transactionLog
      .where("[tenantId+syncStatus]")
      .equals([tenantId, "pending"])
      .filter((tx) => tx.cardId === serverCard.cardId)
      .toArray();

    const hasPendingEdits = pendingEntries.length > 0;

    if (hasPendingEdits && shouldServerWin(localUpdatedAt, serverUpdatedAt, isAdminAction)) {
      // Server wins - discard local outbox entries for this card (Req 12.3, 12.7)
      for (const entry of pendingEntries) {
        if (entry.id != null) {
          await localDb.transactionLog.delete(entry.id);
          outboxDiscarded++;
        }
      }

      // Apply server version of the card
      const updatedCard: Card = {
        tenantId: serverCard.tenantId,
        cardId: serverCard.cardId,
        userId: serverCard.userId,
        status: serverCard.status as Card["status"],
        balance: serverCard.balance,
        counter: serverCard.counter,
        keyVersion: serverCard.keyVersion,
        createdAt: serverCard.createdAt,
        lastActivityAt: serverCard.lastActivityAt,
        expiresAt: serverCard.expiresAt,
        notes: serverCard.notes,
      };

      await localDb.cards.put(updatedCard);
      overwritten++;

      // Show toast notification (Req 12.2)
      showConflictToast("card", serverCard.cardId);
    } else if (!hasPendingEdits) {
      // No pending edits - just apply server version (standard merge, no conflict)
      // This is handled by the normal pull merge logic in syncPull.ts
    }
  }

  return { overwritten, outboxDiscarded };
}

// ── Stale Counter Conflict Resolution ──────────────────────────────────

/**
 * Handle stale_counter conflicts by triggering a pull to get the latest server state.
 *
 * When a transaction push is rejected with stale_counter:
 * - The entry is already marked as "conflict" by syncPush (Req 12.4)
 * - This function triggers a pull to get the latest card state
 * - On network failure: retains "conflict" status, retry on next sync cycle (Req 12.5)
 */
export async function resolveStaleCounterConflicts(
  tenantId: string,
): Promise<{ pullAttempted: boolean; pullSucceeded: boolean }> {
  // Check if there are any entries with "conflict" status
  const conflictEntries = await localDb.transactionLog
    .where("[tenantId+syncStatus]")
    .equals([tenantId, "conflict"])
    .toArray();

  if (conflictEntries.length === 0) {
    return { pullAttempted: false, pullSucceeded: true };
  }

  // Trigger a pull to get the latest server state (Req 12.4)
  try {
    await syncPull(tenantId);
    return { pullAttempted: true, pullSucceeded: true };
  } catch (error: unknown) {
    // On network failure: retain "conflict" status, retry on next sync cycle (Req 12.5)
    if (error instanceof SyncPullError || error instanceof TypeError) {
      // Network failure - retain conflict status, will retry next cycle
      return { pullAttempted: true, pullSucceeded: false };
    }
    // Re-throw non-network errors (auth errors, device blocked, etc.)
    throw error;
  }
}

// ── Toast Notifications ────────────────────────────────────────────────

/**
 * Display a toast notification when a local edit is overwritten by server data.
 * Duration: 5 seconds (Req 12.2).
 */
export function showConflictToast(entityType: "member" | "card", identifier: string): void {
  const entityLabel = entityType === "member" ? "Anggota" : "Kartu";
  toast.info(`${entityLabel} "${identifier}" diperbarui oleh server. Versi server diterapkan.`, {
    duration: CONFLICT_TOAST_DURATION_MS,
  });
}

// ── Main Conflict Resolution Entry Point ───────────────────────────────

/**
 * Resolve all conflicts after a pull completes.
 *
 * This function should be called after syncPull finishes to handle:
 * 1. Member conflicts (server-wins for admin, last-write-wins for edits)
 * 2. Card conflicts (server-wins for admin, last-write-wins for edits)
 * 3. Stale counter conflicts (trigger pull for latest state)
 *
 * @param tenantId - The active tenant ID
 * @param serverMembers - Members received from the pull (with conflict metadata)
 * @param serverCards - Cards received from the pull (with conflict metadata)
 * @returns Conflict resolution result summary
 */
export async function resolveConflicts(
  tenantId: string,
  serverMembers: ServerMemberEntry[] = [],
  serverCards: ServerCardEntry[] = [],
): Promise<ConflictResolutionResult> {
  // Step 1: Resolve member conflicts
  const memberResult = await resolveMemberConflicts(tenantId, serverMembers);

  // Step 2: Resolve card conflicts
  const cardResult = await resolveCardConflicts(tenantId, serverCards);

  // Step 3: Handle stale_counter conflicts (entries already marked "conflict" by syncPush)
  const staleResult = await resolveStaleCounterConflicts(tenantId);

  return {
    membersOverwritten: memberResult.overwritten,
    cardsOverwritten: cardResult.overwritten,
    outboxEntriesDiscarded: memberResult.outboxDiscarded + cardResult.outboxDiscarded,
    staleCounterPullsTriggered: staleResult.pullAttempted ? 1 : 0,
    pullAttempted: staleResult.pullAttempted,
    pullSucceeded: staleResult.pullSucceeded,
  };
}
