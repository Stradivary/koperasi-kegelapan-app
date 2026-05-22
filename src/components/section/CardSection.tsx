import React, { useState, useEffect, useCallback, useRef } from "react";
import { useQuery, useMutation, useQueryClient, type QueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { localDb, type Card } from "../../db/local-db";
import { syncPull } from "../../lib/syncPull";
import { useNfcCard } from "../../hooks/nfc/useNfcCard";
import { useSessionGrant } from "../../hooks/useSessionGrant";
import { useTenantSync } from "../../hooks/useTenantSync";
import { useSyncEngineContext } from "../../hooks/SyncEngineContext";
import { checkLocalBlockedStatus } from "../../core/nfc/localStatusCheck";
import { validateUID } from "../../core/validation/uidGlobalValidator";
import { trackError } from "../../lib/errorTracker";
import {
  StationCardsPanel,
  type StationCardRow,
  type StationUserRow,
  type StationCardsPanelHandle,
} from "../block/StationCardsPanel";
import { StationFixCardPanel } from "../block/StationFixCardPanel";
import { SyncConflictDialog } from "../block/dialogs/SyncConflictDialog";
import { type CardOwnerInfo } from "../block/dialogs/CardOverwriteDialog";
import { CardOverwriteDrawer } from "../block/dialogs/CardOverwriteDrawer";
import { CardNotBlankDrawer } from "../block/dialogs/CardNotBlankDrawer";
import { NfcScanDrawer } from "../block/dialogs/NfcScanDrawer";
import { IssuanceScanDrawer } from "../block/dialogs/IssuanceScanDrawer";
import { IssueCardDrawer } from "../block/dialogs/IssueCardDrawer";
import { TopupDrawer } from "../block/dialogs/TopupDrawer";
import { ConfirmationDialogDrawer } from "../ui/confirmation-dialog-drawer";
import { AlertTriangle } from "lucide-react";
import { applyTopup, applyResetState } from "../../core/state-machine/engine";
import { prepareWrite } from "../../core/nfc/pipelineEngine";
import { extractCardBytes, isNfcSupported } from "../../core/nfc/engine";
import {
  MAGIC,
  CARD_SCHEMA_VERSION,
  CardState,
  CardStatus,
  type CardPayload,
  type SessionGrant,
} from "../../core/payload/types";
import { encodeTenantBind } from "../../core/payload/tenantBind";

interface CardSectionProps {
  tenantId: string;
  accountId: string;
  deviceId: string;
  terminalId: number;
}

function generateCardId(): Uint8Array {
  return crypto.getRandomValues(new Uint8Array(6));
}

function parseHexBytes(hex: string): Uint8Array {
  const normalized = hex.replaceAll(/[^a-fA-F0-9]/g, "").toLowerCase();
  if (normalized.length === 0 || normalized.length % 2 !== 0) {
    throw new Error("ID kartu tidak valid");
  }

  const bytes = new Uint8Array(normalized.length / 2);
  for (let i = 0; i < normalized.length; i += 2) {
    bytes[i / 2] = Number.parseInt(normalized.slice(i, i + 2), 16);
  }
  return bytes;
}

function toPayloadCardId(cardId: string): Uint8Array {
  const rawBytes = parseHexBytes(cardId);
  if (rawBytes.length === 6) return rawBytes;
  if (rawBytes.length > 6) return rawBytes.slice(-6);

  const padded = new Uint8Array(6);
  padded.set(rawBytes, 6 - rawBytes.length);
  return padded;
}

function toPayloadStatus(status: Card["status"]): CardStatus {
  switch (status) {
    case "active":
      return CardStatus.ACTIVE;
    case "blocked_tamper":
      return CardStatus.BLOCKED_TAMPER;
    case "blocked_fraud":
      return CardStatus.BLOCKED_FRAUD;
    case "blocked_expired":
      return CardStatus.BLOCKED_EXPIRED;
    case "blocked_admin":
      return CardStatus.BLOCKED_ADMIN;
    case "deleted":
      throw new Error("Kartu yang dihapus tidak bisa dipulihkan");
  }
}

function buildRecoveryPayload({
  tenantId,
  card,
  ownerName,
  keyVersion,
}: {
  tenantId: string;
  card: Card;
  ownerName: string;
  keyVersion: number;
}): CardPayload {
  const now = Math.floor(Date.now() / 1000);
  const counter = Math.max(card.counter, 1);
  const lastTimestamp = card.lastActivityAt ?? card.createdAt ?? now;

  return {
    header: {
      magic: MAGIC,
      version: CARD_SCHEMA_VERSION,
      type: 0,
      cardId: toPayloadCardId(card.cardId),
      tenantBind: encodeTenantBind(tenantId),
    },
    identity: {
      name: ownerName,
      userId: card.userId ?? "",
      gender: 0,
      status: toPayloadStatus(card.status),
      createdAt: card.createdAt,
    },
    wallet: {
      balance: card.balance,
      lastBalance: card.balance,
      counter: BigInt(counter),
      lastTimestamp,
      state: CardState.IDLE,
      flags: 0,
    },
    session: {
      startTime: 0,
      endTime: 0,
      terminalId: 0,
    },
    logEntries: [],
    trailer: {
      expiresAt: card.expiresAt ?? 9_999_999_999,
      keyVersion,
      rootHash: new Uint8Array(6),
      counterBind: counter,
      hmac: new Uint8Array(8),
      activePtr: 0,
    },
  };
}

/** Thrown when a card serial is already registered to another owner */
class CardAlreadyRegisteredError extends Error {
  constructor(public existingCard: CardOwnerInfo) {
    super("Kartu sudah terdaftar");
    this.name = "CardAlreadyRegisteredError";
  }
}

/** Thrown when the NFC card already contains data (not blank) */
class CardNotBlankError extends Error {
  constructor(public cardSerial: string) {
    super("Kartu sudah berisi data");
    this.name = "CardNotBlankError";
  }
}

// ─── Issuance helpers (module-level, outside component) ──────────────────────

type IssuancePhase = "idle" | "scanning" | "writing" | "done" | "error";

interface IssuanceRefs {
  issuancePreparedRef: React.MutableRefObject<{
    bytes: Uint8Array;
    serial: string;
    payload: CardPayload;
    issueData: { name: string; userId: string | null; balance: number; expiresAt: number | null };
  } | null>;
  issuanceReaderRef: React.MutableRefObject<NDEFReader | null>;
  issuanceAbortRef: React.MutableRefObject<AbortController | null>;
  issuanceTimeoutRef: React.MutableRefObject<ReturnType<typeof setTimeout> | null>;
}

interface IssuanceSetters {
  setIssuancePhase: (phase: IssuancePhase) => void;
  setIssueCardDrawerOpen: (open: boolean) => void;
  setIssuanceError: (err: string | null) => void;
  setIssuancePayload: (payload: CardPayload | null) => void;
}

/**
 * Handles the forceOverwrite path when a prepared NFC session already exists.
 * Returns `true` if the write completed (caller should return), `false` if the
 * session was dead and the caller should fall through to a fresh NFC scan.
 */
async function handleForceOverwrite({
  bytes,
  issuancePreparedRef,
  issuanceReaderRef,
  issuanceAbortRef,
  setIssuancePhase,
  tenantId,
  userId,
  balance,
  expiresAt,
  name,
  qc,
}: {
  bytes: Uint8Array;
  issuancePreparedRef: IssuanceRefs["issuancePreparedRef"];
  issuanceReaderRef: IssuanceRefs["issuanceReaderRef"];
  issuanceAbortRef: IssuanceRefs["issuanceAbortRef"];
  setIssuancePhase: IssuanceSetters["setIssuancePhase"];
  tenantId: string;
  userId: string | null;
  balance: number;
  expiresAt: number | null;
  name: string;
  grant: SessionGrant;
  qc: QueryClient;
}): Promise<boolean> {
  const prepared = issuancePreparedRef.current!;
  const reader = issuanceReaderRef.current;
  const abort = issuanceAbortRef.current;

  if (!reader || !abort || abort.signal.aborted) {
    // Session expired or card removed — start a fresh NFC session instead of failing
    trackError({
      category: "nfc_session_expired",
      message: "NFC session expired during forceOverwrite, starting fresh scan",
      context: { serial: prepared.serial, tenantId },
    });

    issuancePreparedRef.current = null;
    issuanceAbortRef.current?.abort();
    issuanceAbortRef.current = null;
    issuanceReaderRef.current = null;

    return false; // fall through to fresh scan
  }

  setIssuancePhase("writing");

  try {
    await reader.write(
      {
        records: [
          {
            recordType: "unknown",
            data: bytes.buffer.slice(
              bytes.byteOffset,
              bytes.byteOffset + bytes.byteLength,
            ) as ArrayBuffer,
          },
        ],
      },
      { signal: abort.signal, overwrite: true },
    );
  } catch (writeErr) {
    // NFC write failed (card removed, signal aborted, etc.)
    // Instead of throwing and killing the flow, start a fresh NFC session
    trackError({
      category: "nfc_write_failure",
      message: writeErr instanceof Error ? writeErr.message : "Unknown NFC write error",
      context: {
        phase: "forceOverwrite",
        serial: prepared.serial,
        tenantId,
        aborted: abort.signal.aborted,
      },
    });

    // Clean up the dead session
    abort.abort();
    issuanceAbortRef.current = null;
    issuanceReaderRef.current = null;
    issuancePreparedRef.current = null;

    return false; // fall through to fresh scan
  }

  // If write succeeded (no catch triggered), finalize
  if (!abort.signal.aborted && issuancePreparedRef.current) {
    const capturedSerial = prepared.serial;
    const now = Math.floor(Date.now() / 1000);

    await localDb.cards.put({
      tenantId,
      cardId: capturedSerial,
      userId,
      status: "active",
      balance,
      counter: 1,
      keyVersion: prepared.payload.trailer.keyVersion,
      createdAt: now,
      lastActivityAt: now,
      expiresAt,
      notes: name,
      syncStatus: "pending",
    });

    await qc.invalidateQueries({ queryKey: ["station-cards", tenantId] });
    setIssuancePhase("done");
    issuancePreparedRef.current = null;
    return true; // write complete
  }

  return false; // fall through to fresh scan
}

/**
 * Validate UID and throw appropriate errors for conflicts.
 * Returns true if validation passed (caller may proceed to write).
 */
async function validateUIDForIssuance(
  capturedSerial: string,
  tenantId: string,
  forceOverwrite: boolean | undefined,
  abort: AbortController,
  issuancePreparedRef: IssuanceRefs["issuancePreparedRef"],
): Promise<void> {
  const uidResult = await validateUID(capturedSerial, tenantId);
  if (!uidResult.valid) {
    const isRegisteredSameTenant = uidResult.reason === "UID_ALREADY_REGISTERED";
    const isRegisteredOtherTenant = uidResult.reason === "UID_REGISTERED_OTHER_TENANT";

    if (forceOverwrite && (isRegisteredSameTenant || isRegisteredOtherTenant)) {
      // Allow overwrite for same-tenant or cross-tenant re-registration
      return;
    }

    if (isRegisteredSameTenant) {
      const existing = await localDb.cards.get([tenantId, capturedSerial]);
      throw new CardAlreadyRegisteredError({
        cardId: capturedSerial,
        ownerName: existing?.notes ?? null,
        userId: existing?.userId ?? null,
        balance: existing?.balance ?? 0,
        status: existing?.status ?? "active",
      });
    }

    if (isRegisteredOtherTenant) {
      throw new CardAlreadyRegisteredError({
        cardId: capturedSerial,
        ownerName: `Tenant lain (${uidResult.existingTenantId ?? "unknown"})`,
        userId: null,
        balance: 0,
        status: "active",
      });
    }

    abort.abort();
    issuancePreparedRef.current = null;
    const uidErrorMessages: Record<string, string> = {
      NETWORK_ERROR: "Gagal memvalidasi UID: kesalahan jaringan",
      INVALID_UID_FORMAT: "Format UID tidak valid",
    };
    throw new Error(uidErrorMessages[uidResult.reason!] ?? "Validasi UID gagal");
  }
}

/**
 * Check local DB for existing card registration and throw if found.
 */
async function checkLocalCardConflict(capturedSerial: string, tenantId: string): Promise<void> {
  const existing = await localDb.cards.get([tenantId, capturedSerial]);
  if (existing) {
    let ownerName: string | null = existing.notes;
    if (existing.userId != null && !ownerName) {
      const user = await localDb.users.get([tenantId, existing.userId]);
      ownerName = user?.name ?? null;
    }
    throw new CardAlreadyRegisteredError({
      cardId: capturedSerial,
      ownerName,
      userId: existing.userId,
      balance: existing.balance,
      status: existing.status,
    });
  }
}

/**
 * Handles the fresh NFC scan path for card issuance.
 */
async function handleFreshNfcSession({
  bytes,
  payload,
  issuanceAbortRef,
  issuanceReaderRef,
  issuanceTimeoutRef,
  issuancePreparedRef,
  setIssueCardDrawerOpen,
  setIssuancePhase,
  setIssuanceError,
  setIssuancePayload,
  tenantId,
  userId,
  balance,
  expiresAt,
  name,
  grant,
  forceOverwrite,
  qc,
}: {
  bytes: Uint8Array;
  payload: CardPayload;
  issuanceAbortRef: IssuanceRefs["issuanceAbortRef"];
  issuanceReaderRef: IssuanceRefs["issuanceReaderRef"];
  issuanceTimeoutRef: IssuanceRefs["issuanceTimeoutRef"];
  issuancePreparedRef: IssuanceRefs["issuancePreparedRef"];
  setIssueCardDrawerOpen: IssuanceSetters["setIssueCardDrawerOpen"];
  setIssuancePhase: IssuanceSetters["setIssuancePhase"];
  setIssuanceError: IssuanceSetters["setIssuanceError"];
  setIssuancePayload: IssuanceSetters["setIssuancePayload"];
  tenantId: string;
  userId: string | null;
  balance: number;
  expiresAt: number | null;
  name: string;
  grant: SessionGrant;
  forceOverwrite: boolean | undefined;
  qc: QueryClient;
}): Promise<void> {
  setIssueCardDrawerOpen(true);
  setIssuancePhase("scanning");
  setIssuanceError(null);
  setIssuancePayload(null);

  // Clean up any previous session
  issuanceAbortRef.current?.abort();
  if (issuanceTimeoutRef.current) clearTimeout(issuanceTimeoutRef.current);

  const abort = new AbortController();
  issuanceAbortRef.current = abort;
  const reader = new NDEFReader();
  issuanceReaderRef.current = reader;

  const timeout = setTimeout(() => abort.abort(), 30_000);
  issuanceTimeoutRef.current = timeout;

  let capturedSerial: string | null = null;

  try {
    const scanResult = new Promise<{ serial: string; hasData: boolean }>((resolve, reject) => {
      reader.addEventListener("reading", (event: NDEFReadingEvent) => {
        const serial = event.serialNumber?.replaceAll(/[^a-fA-F0-9]/g, "").toLowerCase() || null;
        if (serial) {
          const existingBytes = extractCardBytes(event.message);
          resolve({ serial, hasData: existingBytes !== null });
        } else {
          reject(new Error("Kartu tidak memiliki serial number"));
        }
      });
      abort.signal.addEventListener("abort", () => reject(new Error("Waktu habis")));
    });

    await reader.scan({ signal: abort.signal });

    const { serial, hasData } = await scanResult;
    capturedSerial = serial;

    issuancePreparedRef.current = {
      bytes,
      serial,
      payload,
      issueData: { name, userId, balance, expiresAt },
    };

    if (hasData && !forceOverwrite) {
      throw new CardNotBlankError(capturedSerial);
    }

    // Keep the NFC session alive during UID validation — issuancePreparedRef is already set
    await validateUIDForIssuance(
      capturedSerial,
      tenantId,
      forceOverwrite,
      abort,
      issuancePreparedRef,
    );

    if (!forceOverwrite) {
      await checkLocalCardConflict(capturedSerial, tenantId);
    }

    // ── All checks passed — write to card ──
    setIssuancePhase("writing");
    await reader.write(
      {
        records: [
          {
            recordType: "unknown",
            data: bytes.buffer.slice(
              bytes.byteOffset,
              bytes.byteOffset + bytes.byteLength,
            ) as ArrayBuffer,
          },
        ],
      },
      { signal: abort.signal, overwrite: true },
    );

    const now = Math.floor(Date.now() / 1000);
    await localDb.cards.put({
      tenantId,
      cardId: capturedSerial,
      userId,
      status: "active",
      balance,
      counter: 1,
      keyVersion: grant.keyVersion,
      createdAt: now,
      lastActivityAt: now,
      expiresAt,
      notes: name,
      syncStatus: "pending",
    });

    await qc.invalidateQueries({ queryKey: ["station-cards", tenantId] });
    setIssuancePayload(payload);
    // Hold writing phase so user keeps card in place
    await new Promise((r) => setTimeout(r, 1500));
    setIssuancePhase("done");
    issuancePreparedRef.current = null;
  } catch (e) {
    if (issuanceTimeoutRef.current) {
      clearTimeout(issuanceTimeoutRef.current);
      issuanceTimeoutRef.current = null;
    }

    if (e instanceof CardNotBlankError || e instanceof CardAlreadyRegisteredError) {
      throw e;
    }

    // Track the error for monitoring
    trackError({
      category: "nfc_write_failure",
      message: e instanceof Error ? e.message : "Unknown NFC write error",
      context: {
        phase: "freshSession",
        serial: capturedSerial ?? "unknown",
        tenantId,
        forceOverwrite: forceOverwrite ?? false,
      },
    });

    abort.abort();
    issuancePreparedRef.current = null;
    setIssuancePhase("error");
    setIssuanceError(e instanceof Error ? e.message : "Gagal menerbitkan kartu");
    throw e;
  }
}

/**
 * Handles the full NFC recovery scan-and-write flow.
 */
async function executeRecovery({
  cardId,
  tenantId,
  grant,
  setRecoveryPhase,
  setRecoveryError,
  setRecoveryPayload,
  setRecoverySerial,
  qc,
}: {
  cardId: string;
  tenantId: string;
  grant: SessionGrant;
  setRecoveryPhase: (phase: "idle" | "scanning" | "writing" | "done" | "error") => void;
  setRecoveryError: (err: string | null) => void;
  setRecoveryPayload: (payload: CardPayload | null) => void;
  setRecoverySerial: (serial: string | null) => void;
  qc: QueryClient;
}): Promise<void> {
  await syncPull(tenantId);

  const latestCard = await localDb.cards.get([tenantId, cardId]);
  if (!latestCard || latestCard.status === "deleted") {
    throw new Error("Data kartu tidak ditemukan di penyimpanan lokal");
  }
  if (latestCard.syncStatus === "pending") {
    throw new Error("Perubahan kartu ini belum tersinkron. Sinkronkan dulu sebelum recovery.");
  }

  const owner = latestCard.userId ? await localDb.users.get([tenantId, latestCard.userId]) : null;
  const payload = buildRecoveryPayload({
    tenantId,
    card: latestCard,
    ownerName: owner?.name ?? latestCard.notes ?? "Anggota",
    keyVersion: grant.keyVersion,
  });
  const { bytes } = await prepareWrite(payload, payload, grant);

  const abort = new AbortController();
  const reader = new NDEFReader();
  const timeout = setTimeout(() => abort.abort(), 30_000);

  let scannedSerial: string | null = null;

  try {
    const scanResult = new Promise<string>((resolve, reject) => {
      reader.addEventListener("reading", (event: NDEFReadingEvent) => {
        const serial = event.serialNumber?.replaceAll(/[^a-fA-F0-9]/g, "").toLowerCase() || null;
        if (!serial) {
          reject(new Error("Kartu tidak memiliki serial number"));
          return;
        }
        resolve(serial);
      });
      abort.signal.addEventListener("abort", () => reject(new Error("Waktu habis")));
    });

    await reader.scan({ signal: abort.signal });
    scannedSerial = await scanResult;

    if (scannedSerial !== cardId.toLowerCase()) {
      throw new Error("Kartu yang di-scan tidak sesuai dengan kartu yang dipilih");
    }

    setRecoveryPhase("writing");
    await reader.write(
      {
        records: [
          {
            recordType: "unknown",
            data: bytes.buffer.slice(
              bytes.byteOffset,
              bytes.byteOffset + bytes.byteLength,
            ) as ArrayBuffer,
          },
        ],
      },
      { signal: abort.signal, overwrite: true },
    );

    setRecoveryPayload(payload);
    setRecoverySerial(scannedSerial);
    await qc.invalidateQueries({ queryKey: ["station-cards", tenantId] });
    await new Promise((resolve) => setTimeout(resolve, 1500));
    setRecoveryPhase("done");
  } catch (error) {
    setRecoveryPhase("error");
    setRecoveryError(error instanceof Error ? error.message : "Gagal memulihkan kartu");
    throw error;
  } finally {
    clearTimeout(timeout);
    abort.abort();
  }
}

async function getCardsWithUsers(tenantId: string): Promise<StationCardRow[]> {
  const [cardRows, userRows] = await Promise.all([
    localDb.cards.where("tenantId").equals(tenantId).toArray(),
    localDb.users.where("tenantId").equals(tenantId).toArray(),
  ]);
  const userMap = new Map<string, string>(userRows.map((u) => [u.userId, u.name]));
  return cardRows
    .filter((c) => c.status !== "deleted")
    .map((c) => ({
      cardId: c.cardId,
      userId: c.userId,
      userName: c.userId != null ? (userMap.get(c.userId) ?? null) : null,
      status: c.status,
      syncStatus: c.syncStatus ?? "synced",
      balance: c.balance,
      counter: c.counter,
      expiresAt:
        c.expiresAt != null ? new Date(c.expiresAt * 1000).toISOString().split("T")[0] : null,
    }));
}

export function CardSection({ tenantId, accountId, deviceId, terminalId }: CardSectionProps) {
  const [isDrawerOpen, setIsDrawerOpen] = useState(false);
  const [topupDrawerOpen, setTopupDrawerOpen] = useState(false);
  const [topupTargetCardId, setTopupTargetCardId] = useState<string | null>(null);
  const [topupMismatchOpen, setTopupMismatchOpen] = useState(false);
  const [topupMismatchSerial, setTopupMismatchSerial] = useState<string | null>(null);
  const [recoveryDrawerOpen, setRecoveryDrawerOpen] = useState(false);
  const [recoveryPhase, setRecoveryPhase] = useState<
    "idle" | "scanning" | "writing" | "done" | "error"
  >("idle");
  const [recoveryError, setRecoveryError] = useState<string | null>(null);
  const [recoveryPayload, setRecoveryPayload] = useState<CardPayload | null>(null);
  const [recoverySerial, setRecoverySerial] = useState<string | null>(null);
  const [recoveryTargetCardId, setRecoveryTargetCardId] = useState<string | null>(null);
  const [fixCardId, setFixCardId] = useState<string | null>(null);
  const [showFixCard, setShowFixCard] = useState(false);
  const [resetCardPending, setResetCardPending] = useState(false);

  // ── Issuance flow state ──
  const [issueCardDrawerOpen, setIssueCardDrawerOpen] = useState(false);
  const [issuancePhase, setIssuancePhase] = useState<IssuancePhase>("idle");
  const [issuanceError, setIssuanceError] = useState<string | null>(null);
  const [issuancePayload, setIssuancePayload] = useState<CardPayload | null>(null);

  const [overwriteDialog, setOverwriteDialog] = useState<{
    existingCard: CardOwnerInfo;
    pendingIssue: {
      name: string;
      userId: string | null;
      balance: number;
      expiresAt: number | null;
    };
  } | null>(null);
  const [notBlankDialog, setNotBlankDialog] = useState<{
    cardSerial: string;
    pendingIssue: {
      name: string;
      userId: string | null;
      balance: number;
      expiresAt: number | null;
    };
  } | null>(null);

  // Refs for the issuance NFC session — kept alive across conflict dialogs
  const issuanceAbortRef = useRef<AbortController | null>(null);
  const issuanceReaderRef = useRef<NDEFReader | null>(null);
  const issuanceTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const issuancePreparedRef = useRef<{
    bytes: Uint8Array;
    serial: string;
    payload: CardPayload;
    issueData: { name: string; userId: string | null; balance: number; expiresAt: number | null };
  } | null>(null);
  // Guard ref: set to true when onConfirm is in progress, prevents onCancel from cleaning up
  const isConfirmingOverwriteRef = useRef(false);
  const isConfirmingNotBlankRef = useRef(false);
  const cardsPanelRef = useRef<StationCardsPanelHandle>(null);

  const qc = useQueryClient();

  const { grant } = useSessionGrant(tenantId, accountId, deviceId);
  const { state, scan, write, reset, cancel } = useNfcCard(grant, tenantId, terminalId);
  const { status: syncStatus, conflict, retryWithChanges, reset: resetSync } = useTenantSync();

  const syncEngineCtx = useSyncEngineContext();

  // Normalize hardware serial number to consistent hex format
  const normalizeSerial = (sn: string | null): string | null => {
    if (!sn) return null;
    const normalized = sn.replaceAll(/[^a-fA-F0-9]/g, "").toLowerCase();
    return normalized || null;
  };

  // Auto-close drawer after success and sync local DB
  useEffect(() => {
    if (state.phase === "success" && state.payload) {
      const payload = state.payload;
      const cardId = normalizeSerial(state.serialNumber);
      if (!cardId) return;
      localDb.cards.get([tenantId, cardId]).then((existing) => {
        if (existing) {
          const updates: Partial<Card> = {
            balance: payload.wallet.balance,
            counter: Number(payload.wallet.counter),
            lastActivityAt: Math.floor(Date.now() / 1000),
          };
          if (resetCardPending) {
            updates.status = "active";
          }
          localDb.cards.update([tenantId, cardId], updates);
        }
        qc.invalidateQueries({ queryKey: ["station-cards", tenantId] });
      });

      syncEngineCtx?.notifyMutation();

      const timer = setTimeout(() => {
        reset();
        setIsDrawerOpen(false);
        setTopupDrawerOpen(false);
        setTopupTargetCardId(null);
        setTopupMismatchOpen(false);
        setTopupMismatchSerial(null);
        setResetCardPending(false);
      }, 2500);
      return () => clearTimeout(timer);
    }
  }, [
    state.phase,
    state.payload,
    state.serialNumber,
    reset,
    tenantId,
    qc,
    resetCardPending,
    syncEngineCtx,
  ]);

  // Auto-sync card data to local DB when scanned
  useEffect(() => {
    if (state.phase !== "ready" || !state.payload) return;

    const payload = state.payload;
    const cardId = normalizeSerial(state.serialNumber);
    if (!cardId) return;

    localDb.cards.get([tenantId, cardId]).then((existing) => {
      if (existing) {
        localDb.cards.update([tenantId, cardId], {
          balance: payload.wallet.balance,
          counter: Number(payload.wallet.counter),
          lastActivityAt: Math.floor(Date.now() / 1000),
          syncStatus: "pending",
        });
      } else {
        localDb.cards.put({
          tenantId,
          cardId,
          userId: null,
          status: "active",
          balance: payload.wallet.balance,
          counter: Number(payload.wallet.counter),
          keyVersion: payload.trailer.keyVersion,
          createdAt: payload.identity.createdAt,
          lastActivityAt: Math.floor(Date.now() / 1000),
          expiresAt: payload.trailer.expiresAt < 9_999_999_999 ? payload.trailer.expiresAt : null,
          notes: payload.identity.name,
          syncStatus: "pending",
        });
      }
      qc.invalidateQueries({ queryKey: ["station-cards", tenantId] });
    });
  }, [state.phase, state.payload, state.serialNumber, tenantId, qc]);

  const handleDrawerClose = useCallback(() => {
    if (state.phase === "scanning" || state.phase === "validating") {
      cancel();
    } else {
      reset();
    }
    setIsDrawerOpen(false);
    setTopupDrawerOpen(false);
    setTopupTargetCardId(null);
    setTopupMismatchOpen(false);
    setTopupMismatchSerial(null);
    setResetCardPending(false);
  }, [state.phase, cancel, reset]);

  const handleDrawerOpenChange = useCallback(
    (open: boolean) => {
      if (!open) handleDrawerClose();
    },
    [handleDrawerClose],
  );

  // Reset: once card is scanned, write reset state to card
  const handleResetWrite = useCallback(async () => {
    if (!state.payload || !grant) return;
    const now = Math.floor(Date.now() / 1000);
    const updated = applyResetState(state.payload, now);
    await write(updated, "admin_reset");
  }, [state.payload, grant, write]);

  // Queries
  const cards = useQuery<StationCardRow[]>({
    queryKey: ["station-cards", tenantId],
    queryFn: () => getCardsWithUsers(tenantId),
  });

  const members = useQuery<StationUserRow[]>({
    queryKey: ["users", tenantId],
    queryFn: async () => {
      const all = await localDb.users.where("tenantId").equals(tenantId).toArray();
      return all.filter((u) => u.status !== "deleted") as StationUserRow[];
    },
  });

  // Mutations
  const updateCardStatus = useMutation({
    mutationFn: async ({ card, status }: { card: StationCardRow; status: string }) => {
      await localDb.cards.update([tenantId, card.cardId], {
        status: status as Card["status"],
        syncStatus: "pending",
      });
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["station-cards", tenantId] });
      syncEngineCtx?.notifyMutation();
    },
  });

  const deleteCard = useMutation({
    mutationFn: async ({ card }: { card: StationCardRow }) => {
      await localDb.cards.update([tenantId, card.cardId], {
        status: "deleted",
        lastActivityAt: Math.floor(Date.now() / 1000),
        syncStatus: "pending",
      });
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["station-cards", tenantId] });
      syncEngineCtx?.notifyMutation();
    },
  });

  const issueCard = useMutation({
    mutationFn: async ({
      name,
      userId,
      balance,
      expiresAt,
      forceOverwrite,
    }: {
      name: string;
      userId: string | null;
      balance: number;
      expiresAt: number | null;
      forceOverwrite?: boolean;
    }) => {
      if (!grant) throw new Error("Sesi tidak aktif untuk membuat kartu");
      if (!isNfcSupported()) throw new Error("NFC tidak didukung di perangkat ini");

      const now = Math.floor(Date.now() / 1000);
      const cardId = generateCardId();

      const payload: CardPayload = {
        header: {
          magic: MAGIC,
          version: CARD_SCHEMA_VERSION,
          type: 0,
          cardId,
          tenantBind: encodeTenantBind(tenantId),
        },
        identity: {
          name: name || "Anggota",
          userId: userId || "",
          gender: 0,
          status: CardStatus.ACTIVE,
          createdAt: now,
        },
        wallet: {
          balance,
          lastBalance: 0,
          counter: 1n,
          lastTimestamp: now,
          state: CardState.IDLE,
          flags: 0,
        },
        session: { startTime: 0, endTime: 0, terminalId: 0 },
        logEntries: [],
        trailer: {
          expiresAt: expiresAt ?? 9_999_999_999,
          keyVersion: grant.keyVersion,
          rootHash: new Uint8Array(6),
          counterBind: 1,
          hmac: new Uint8Array(8),
          activePtr: 0,
        },
      };

      const { bytes } = await prepareWrite(payload, payload, grant);

      // ── If forceOverwrite with a prepared session, write immediately ──
      if (forceOverwrite && issuancePreparedRef.current) {
        const done = await handleForceOverwrite({
          bytes,
          issuancePreparedRef,
          issuanceReaderRef,
          issuanceAbortRef,
          setIssuancePhase,
          tenantId,
          userId,
          balance,
          expiresAt,
          name,
          grant,
          qc,
        });
        if (done) {
          setIssuancePayload(payload);
          // Hold writing phase so user keeps card in place
          await new Promise((r) => setTimeout(r, 1500));
          return;
        }
        // Session was dead — fall through to fresh NFC scan
      }

      // ── Fresh NFC session — open drawer and scan ──
      await handleFreshNfcSession({
        bytes,
        payload,
        issuanceAbortRef,
        issuanceReaderRef,
        issuanceTimeoutRef,
        issuancePreparedRef,
        setIssueCardDrawerOpen,
        setIssuancePhase,
        setIssuanceError,
        setIssuancePayload,
        tenantId,
        userId,
        balance,
        expiresAt,
        name,
        grant,
        forceOverwrite,
        qc,
      });
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["station-cards", tenantId] });
      syncEngineCtx?.notifyMutation();
    },
  });

  // Helper to clean up the issuance NFC session
  const cleanupIssuanceSession = useCallback(() => {
    if (issuanceTimeoutRef.current) {
      clearTimeout(issuanceTimeoutRef.current);
      issuanceTimeoutRef.current = null;
    }
    issuanceAbortRef.current?.abort();
    issuanceAbortRef.current = null;
    issuanceReaderRef.current = null;
    issuancePreparedRef.current = null;
  }, []);

  const handleIssuanceDrawerClose = useCallback(() => {
    cleanupIssuanceSession();
    setIssueCardDrawerOpen(false);
    setIssuancePhase("idle");
    setIssuanceError(null);
    setIssuancePayload(null);
  }, [cleanupIssuanceSession]);

  // Auto-close issuance drawer after success
  useEffect(() => {
    if (issuancePhase === "done") {
      const timer = setTimeout(() => {
        handleIssuanceDrawerClose();
      }, 2500);
      return () => clearTimeout(timer);
    }
  }, [issuancePhase, handleIssuanceDrawerClose]);

  const fixCard = useMutation({
    mutationFn: async ({
      cardId,
      userId,
      balance,
      expiresAt,
    }: {
      cardId: string;
      userId: string | null;
      balance: number;
      expiresAt: number | null;
    }) => {
      const now = Math.floor(Date.now() / 1000);
      const existing = await localDb.cards.get([tenantId, cardId]);
      if (existing) {
        await localDb.cards.update([tenantId, cardId], {
          userId,
          status: "active",
          balance,
          expiresAt,
          lastActivityAt: now,
          syncStatus: "pending",
        });
      } else {
        await localDb.cards.put({
          tenantId,
          cardId,
          userId,
          status: "active",
          balance,
          counter: 0,
          keyVersion: 1,
          createdAt: now,
          lastActivityAt: now,
          expiresAt,
          notes: null,
          syncStatus: "pending",
        });
      }
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["station-cards", tenantId] });
      syncEngineCtx?.notifyMutation();
    },
  });

  const recoverCard = useMutation({
    mutationFn: async ({ cardId }: { cardId: string }) => {
      if (!grant) throw new Error("Sesi tidak aktif untuk memulihkan kartu");
      if (!isNfcSupported()) throw new Error("NFC tidak didukung di perangkat ini");

      setRecoveryDrawerOpen(true);
      setRecoveryPhase("scanning");
      setRecoveryError(null);
      setRecoveryPayload(null);
      setRecoverySerial(null);

      await executeRecovery({
        cardId,
        tenantId,
        grant,
        setRecoveryPhase,
        setRecoveryError,
        setRecoveryPayload,
        setRecoverySerial,
        qc,
      });
    },
    onSuccess: () => {
      toast.success("Kartu berhasil dipulihkan dari data server terbaru");
    },
    onError: (error) => {
      toast.error(error instanceof Error ? error.message : "Gagal memulihkan kartu");
    },
  });

  const handleRecoveryDrawerClose = useCallback(() => {
    setRecoveryDrawerOpen(false);
    setRecoveryPhase("idle");
    setRecoveryError(null);
    setRecoveryPayload(null);
    setRecoverySerial(null);
    setRecoveryTargetCardId(null);
  }, []);

  const startCardRecovery = useCallback(
    (cardId: string) => {
      setRecoveryTargetCardId(cardId);
      recoverCard.mutate({ cardId });
    },
    [recoverCard],
  );

  const handleFixCard = useCallback(() => {
    const scannedSerial = normalizeSerial(state.serialNumber);
    if (scannedSerial) {
      handleDrawerClose();
      startCardRecovery(scannedSerial);
      return;
    }

    setFixCardId(state.serialNumber);
    handleDrawerClose();
    setShowFixCard(true);
  }, [state.serialNumber, handleDrawerClose, startCardRecovery]);

  // Top-up flow handler
  const handleTopupCard = useCallback(
    (cardId: string) => {
      setTopupTargetCardId(cardId);
      setTopupDrawerOpen(true);
      scan();
    },
    [scan],
  );

  // Reset card flow handler
  const handleResetCard = useCallback(
    (_card: StationCardRow) => {
      setResetCardPending(true);
      setIsDrawerOpen(true);
      scan();
    },
    [scan],
  );

  // Top-up: validate card/user status immediately after scan (before nominal input)
  useEffect(() => {
    if (state.phase !== "ready" || !topupDrawerOpen) return;

    const scannedId = normalizeSerial(state.serialNumber);

    // Validate scanned card matches the selected card
    if (topupTargetCardId && scannedId && scannedId !== topupTargetCardId) {
      setTopupMismatchSerial(scannedId);
      setTopupMismatchOpen(true);
      return;
    }

    // Check if card/user is blocked
    if (state.serialNumber) {
      checkLocalBlockedStatus(tenantId, state.serialNumber).then((statusResult) => {
        if (statusResult.blocked) {
          toast.error(statusResult.reason ?? "Kartu diblokir", { duration: 5000 });
          handleDrawerClose();
        }
      });
    }
  }, [
    state.phase,
    topupDrawerOpen,
    state.serialNumber,
    topupTargetCardId,
    tenantId,
    handleDrawerClose,
  ]);

  // Top-up: user confirmed amount in the drawer
  const handleTopupConfirm = useCallback(
    async (amount: number) => {
      if (!state.payload || !grant) return;

      const now = Math.floor(Date.now() / 1000);
      const updated = applyTopup(state.payload, amount, now);
      await write(updated, "topup");
    },
    [state.payload, grant, write],
  );

  // When card becomes ready and we have a pending reset, trigger write
  useEffect(() => {
    if (state.phase === "ready" && resetCardPending && state.payload) {
      handleResetWrite();
    }
  }, [state.phase, resetCardPending, state.payload, handleResetWrite]);

  // Open the IssueCardDrawer in form phase
  const handleIssueNew = useCallback(() => {
    setIssueCardDrawerOpen(true);
    setIssuancePhase("idle");
    setIssuanceError(null);
    setIssuancePayload(null);
  }, []);

  return (
    <>
      {/* {state.error && (
        <div className="mb-4 px-4 py-3 rounded-lg bg-destructive/10 border border-destructive/20 text-sm text-destructive">
          {state.error}
        </div>
      )} */}

      {!showFixCard && (
        <StationCardsPanel
          ref={cardsPanelRef}
          cards={cards.data ?? []}
          members={members.data ?? []}
          isLoading={cards.isLoading}
          isTopping={state.phase === "writing"}
          isIssuing={issueCard.isPending}
          isRecovering={recoverCard.isPending}
          isUpdatingStatus={updateCardStatus.isPending}
          isDeleting={deleteCard.isPending}
          isResetting={
            resetCardPending && (state.phase === "scanning" || state.phase === "writing")
          }
          hasGrant={!!grant}
          onTopupCard={handleTopupCard}
          onRecoverCard={(card) => startCardRecovery(card.cardId)}
          onIssueNew={handleIssueNew}
          onUpdateCardStatus={(card, newStatus) =>
            updateCardStatus.mutate({ card, status: newStatus })
          }
          onDeleteCard={(card) => deleteCard.mutate({ card })}
          onResetCard={handleResetCard}
        />
      )}

      {showFixCard && (
        <StationFixCardPanel
          cardId={fixCardId}
          cards={cards.data ?? []}
          members={members.data ?? []}
          isFixing={fixCard.isPending}
          hasGrant={!!grant}
          onFixCard={(data) => fixCard.mutateAsync(data)}
          onBack={() => {
            setFixCardId(null);
            setShowFixCard(false);
          }}
        />
      )}

      <NfcScanDrawer
        open={isDrawerOpen}
        onOpenChange={handleDrawerOpenChange}
        phase={state.phase}
        payload={state.payload}
        isCheckedIn={false}
        error={state.error}
        tamperDetected={state.tamperDetected}
        onCheckin={() => {}}
        onCheckout={() => {}}
        onClose={handleDrawerClose}
        onRetry={scan}
        onFixCard={handleFixCard}
      />

      <TopupDrawer
        open={topupDrawerOpen}
        onOpenChange={(open) => {
          if (!open) handleDrawerClose();
        }}
        phase={state.phase}
        payload={state.payload}
        error={state.error}
        onTopup={handleTopupConfirm}
        onClose={handleDrawerClose}
        onRetry={scan}
      />

      <ConfirmationDialogDrawer
        open={topupMismatchOpen}
        onOpenChange={(o) => {
          if (!o) {
            setTopupMismatchOpen(false);
            handleDrawerClose();
          }
        }}
        title="Kartu Tidak Sesuai"
        description={<p>Kartu yang di-scan tidak sesuai dengan kartu yang dipilih untuk top-up.</p>}
        icon={
          <div className="flex items-center justify-center size-12 rounded-full bg-amber-100">
            <AlertTriangle size={24} className="text-amber-600" />
          </div>
        }
        confirmLabel="Scan Ulang"
        cancelLabel="Batal"
        confirmVariant="default"
        onConfirm={() => {
          setTopupMismatchOpen(false);
          setTopupMismatchSerial(null);
          scan();
        }}
        onCancel={() => {
          setTopupMismatchOpen(false);
          handleDrawerClose();
        }}
      >
        <div className="rounded-lg bg-muted p-3 text-sm space-y-1">
          <p>
            <span className="text-muted-foreground">Kartu dipilih:</span>{" "}
            <span className="font-mono">{topupTargetCardId ?? "-"}</span>
          </p>
          <p>
            <span className="text-muted-foreground">Kartu di-scan:</span>{" "}
            <span className="font-mono">{topupMismatchSerial ?? "-"}</span>
          </p>
        </div>
        <p className="text-sm text-muted-foreground mt-3">
          Pastikan kartu yang di-tap adalah kartu yang benar.
        </p>
      </ConfirmationDialogDrawer>

      <IssueCardDrawer
        open={issueCardDrawerOpen}
        onOpenChange={(open) => {
          if (!open) handleIssuanceDrawerClose();
        }}
        phase={
          issuancePhase === "idle"
            ? "form"
            : issuancePhase === "scanning"
              ? "scanning"
              : issuancePhase === "writing"
                ? "writing"
                : issuancePhase === "done"
                  ? "done"
                  : "error"
        }
        payload={issuancePayload}
        error={issuanceError}
        members={members.data ?? []}
        onIssue={async (data) => {
          try {
            await issueCard.mutateAsync(data);
          } catch (e) {
            if (e instanceof CardAlreadyRegisteredError) {
              if (issuanceTimeoutRef.current) {
                clearTimeout(issuanceTimeoutRef.current);
                issuanceTimeoutRef.current = null;
              }
              setOverwriteDialog({ existingCard: e.existingCard, pendingIssue: data });
            } else if (e instanceof CardNotBlankError) {
              if (issuanceTimeoutRef.current) {
                clearTimeout(issuanceTimeoutRef.current);
                issuanceTimeoutRef.current = null;
              }
              setNotBlankDialog({ cardSerial: e.cardSerial, pendingIssue: data });
            }
          }
        }}
        onClose={handleIssuanceDrawerClose}
        onRetry={() => {
          const prepared = issuancePreparedRef.current;
          if (prepared) {
            cleanupIssuanceSession();
            issueCard.mutate(prepared.issueData);
          } else {
            setIssuancePhase("idle");
          }
        }}
      />

      <IssuanceScanDrawer
        open={recoveryDrawerOpen}
        onOpenChange={(open) => {
          if (!open) handleRecoveryDrawerClose();
        }}
        phase={recoveryPhase}
        mode="write"
        payload={recoveryPayload}
        serialNumber={recoverySerial}
        error={recoveryError}
        minimal
        onClose={handleRecoveryDrawerClose}
        onRetry={() => {
          if (!recoveryTargetCardId) return;
          recoverCard.mutate({ cardId: recoveryTargetCardId });
        }}
      />

      <CardOverwriteDrawer
        open={overwriteDialog != null}
        existingCard={overwriteDialog?.existingCard ?? null}
        newOwnerName={overwriteDialog?.pendingIssue.name ?? ""}
        newUserId={overwriteDialog?.pendingIssue.userId ?? null}
        isProcessing={issuancePhase === "writing"}
        onCancel={() => {
          // Guard: if onConfirm is in progress, the drawer is closing programmatically — skip cleanup
          if (isConfirmingOverwriteRef.current) return;
          setOverwriteDialog(null);
          cleanupIssuanceSession();
          setIssueCardDrawerOpen(false);
          setIssuancePhase("idle");
        }}
        onConfirm={async () => {
          if (!overwriteDialog) return;
          const pending = overwriteDialog.pendingIssue;
          isConfirmingOverwriteRef.current = true;
          setOverwriteDialog(null);
          try {
            await issueCard.mutateAsync({
              ...pending,
              forceOverwrite: true,
            });
            toast.success("Kartu berhasil dicetak dan didaftarkan");
          } catch (e) {
            if (!(e instanceof CardNotBlankError) && !(e instanceof CardAlreadyRegisteredError)) {
              toast.error(e instanceof Error ? e.message : "Gagal menulis kartu");
              cleanupIssuanceSession();
              setIssuancePhase("error");
              setIssuanceError(e instanceof Error ? e.message : "Gagal menulis kartu");
            }
          } finally {
            isConfirmingOverwriteRef.current = false;
          }
        }}
      />

      <CardNotBlankDrawer
        open={notBlankDialog != null}
        cardSerial={notBlankDialog?.cardSerial ?? null}
        isProcessing={issuancePhase === "writing"}
        onCancel={() => {
          // Guard: if onConfirm is in progress, the drawer is closing programmatically — skip cleanup
          if (isConfirmingNotBlankRef.current) return;
          setNotBlankDialog(null);
          cleanupIssuanceSession();
          setIssueCardDrawerOpen(false);
          setIssuancePhase("idle");
        }}
        onConfirm={async () => {
          if (!notBlankDialog) return;
          const pending = notBlankDialog.pendingIssue;
          isConfirmingNotBlankRef.current = true;
          setNotBlankDialog(null);
          try {
            await issueCard.mutateAsync({
              ...pending,
              forceOverwrite: true,
            });
            toast.success("Kartu berhasil dicetak dan didaftarkan");
          } catch (e) {
            if (e instanceof CardAlreadyRegisteredError) {
              setOverwriteDialog({ existingCard: e.existingCard, pendingIssue: pending });
            } else if (!(e instanceof CardNotBlankError)) {
              toast.error(e instanceof Error ? e.message : "Gagal menulis kartu");
              cleanupIssuanceSession();
              setIssuancePhase("error");
              setIssuanceError(e instanceof Error ? e.message : "Gagal menulis kartu");
            }
          } finally {
            isConfirmingNotBlankRef.current = false;
          }
        }}
      />

      {/* Sync Conflict Dialog */}
      {conflict && (
        <SyncConflictDialog
          open={syncStatus === "conflict"}
          conflict={conflict}
          onDismiss={resetSync}
          onRetryWithChanges={(newSlug, newAdminUsername) => {
            retryWithChanges(newSlug, newAdminUsername);
          }}
          isRetrying={syncStatus === "syncing"}
        />
      )}
    </>
  );
}
