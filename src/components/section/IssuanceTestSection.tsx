import { useState, useRef, useCallback } from "react";
import { readCard, isNfcSupported } from "../../core/nfc/engine";
import { decodePayload } from "../../core/payload/engine";
import { prepareWrite, decryptCardBody } from "../../core/nfc/pipelineEngine";
import {
  MAGIC,
  CARD_SCHEMA_VERSION,
  BUFFER_SIZE,
  WIRE_SIZE,
  TRAILER_COUNTER_BIND,
  CardState,
  CardStatus,
} from "../../core/payload/types";
import type { CardPayload, SessionGrant } from "../../core/payload/types";
import { API_BASE_URL } from "../../lib/api";
import { Button } from "../ui/button";
import { Input } from "../ui/input";
import { Label } from "../ui/label";
import { Separator } from "../ui/separator";
import { IssuanceScanDrawer } from "../block/dialogs/IssuanceScanDrawer";

// ─── helpers ────────────────────────────────────────────────────────────────

function randomBytes(n: number): Uint8Array {
  const buf = new Uint8Array(n);
  crypto.getRandomValues(buf);
  return buf;
}

export function makeFreshCard(opts: {
  name: string;
  userId: string;
  balance: number;
  expiresAt: number;
}): CardPayload {
  const now = Math.floor(Date.now() / 1000);
  const cardId = randomBytes(6);

  return {
    header: {
      magic: MAGIC,
      version: CARD_SCHEMA_VERSION,
      type: 0,
      cardId,
      tenantBind: 0,
    },
    identity: {
      name: opts.name,
      userId: opts.userId,
      gender: 0,
      status: CardStatus.ACTIVE,
      createdAt: now,
    },
    wallet: {
      balance: opts.balance,
      lastBalance: 0,
      counter: 1n,
      lastTimestamp: now,
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
      expiresAt: opts.expiresAt,
      keyVersion: 1,
      rootHash: new Uint8Array(6),
      counterBind: 1,
      hmac: new Uint8Array(8),
      activePtr: 0,
    },
  };
}

async function fetchDevGrant(tenantId: string): Promise<SessionGrant> {
  // Fetch a session grant using the specified tenant ID
  const params = new URLSearchParams({ tenantId, deviceId: "dev-issuance" });
  params.set("role", "station");
  const res = await fetch(`${API_BASE_URL}/api/session-grant?${params}`);
  if (!res.ok) throw new Error(`Failed to fetch dev grant: ${res.status}`);
  const data = await res.json();
  const b64ToBytes = (b64: string): Uint8Array => {
    const std = b64.replace(/-/g, "+").replace(/_/g, "/");
    const padded = std + "=".repeat((4 - (std.length % 4)) % 4);
    const bin = atob(padded);
    const bytes = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
    return bytes;
  };
  return {
    keyVersion: data.keyVersion,
    sessionKey: b64ToBytes(data.sessionKey),
    expiresAt: data.expiresAt,
    allowedOps: data.allowedOps,
    signature: b64ToBytes(data.signature),
    tenantId,
    accountId: "dev",
    deviceId: "dev-issuance",
  };
}

// ─── component ───────────────────────────────────────────────────────────────

type Phase = "idle" | "scanning" | "writing" | "done" | "error";

export function IssuanceTestSection() {
  const [phase, setPhase] = useState<Phase>("idle");
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [readPayload, setReadPayload] = useState<CardPayload | null>(null);
  const [serialNumber, setSerialNumber] = useState<string | null>(null);
  const [isDrawerOpen, setIsDrawerOpen] = useState(false);
  const [drawerMode, setDrawerMode] = useState<"read" | "write">("read");
  const abortRef = useRef<AbortController | null>(null);

  // issuance form state
  const [tenantId, setTenantId] = useState("dev");
  const [name, setName] = useState("Test User");
  const [userId, setUserId] = useState("1001");
  const [balance, setBalance] = useState("50000");
  const [expiresOffset, setExpiresOffset] = useState("365"); // days from now

  const nfcAvailable = isNfcSupported();

  const handleDrawerClose = useCallback(() => {
    if (phase === "scanning" || phase === "writing") {
      abortRef.current?.abort();
    }
    setPhase("idle");
    setErrorMsg(null);
    setIsDrawerOpen(false);
  }, [phase]);

  // ── READ ──────────────────────────────────────────────────────────────────
  const handleRead = useCallback(async () => {
    abortRef.current?.abort();
    abortRef.current = new AbortController();
    setDrawerMode("read");
    setIsDrawerOpen(true);
    setPhase("scanning");
    setErrorMsg(null);
    setReadPayload(null);
    setSerialNumber(null);

    const result = await readCard(abortRef.current.signal);
    if (!result.ok) {
      setPhase("error");
      setErrorMsg(result.error);
      return;
    }

    try {
      const raw = result.raw;
      const version = raw[4];
      let decodableRaw = raw;

      // Decrypt if v2+ encrypted card
      if (version >= 2) {
        try {
          const devGrant = await fetchDevGrant(tenantId);
          const trailerView = new DataView(raw.buffer, raw.byteOffset + BUFFER_SIZE);
          const counterBind = trailerView.getUint32(TRAILER_COUNTER_BIND, true);
          const cardId = raw.slice(6, 12);
          const decryptedBuf = await decryptCardBody(
            raw.slice(0, BUFFER_SIZE),
            devGrant.sessionKey,
            cardId,
            BigInt(counterBind),
          );
          const full = new Uint8Array(WIRE_SIZE);
          full.set(decryptedBuf, 0);
          full.set(raw.slice(BUFFER_SIZE), BUFFER_SIZE);
          decodableRaw = full;
        } catch {
          // If decryption fails, try plaintext decode as fallback
        }
      }

      const payload = decodePayload(decodableRaw);
      setReadPayload(payload);
      setSerialNumber(result.serialNumber);
      setPhase("done");
    } catch (e) {
      setPhase("error");
      setErrorMsg(`Decode failed: ${e}`);
    }
  }, [tenantId]);

  // ── WRITE (issue fresh card) ───────────────────────────────────────────────
  const handleIssue = useCallback(async () => {
    abortRef.current?.abort();
    abortRef.current = new AbortController();
    setDrawerMode("write");
    setIsDrawerOpen(true);
    setPhase("writing");
    setErrorMsg(null);

    const expiresAt = Math.floor(Date.now() / 1000) + parseInt(expiresOffset, 10) * 86400;

    let originalPayload: CardPayload;
    try {
      originalPayload = makeFreshCard({
        name,
        userId: userId,
        balance: parseInt(balance, 10),
        expiresAt,
      });

      // Fetch a session grant and encrypt the card properly
      const devGrant = await fetchDevGrant(tenantId);
      const prepared = await prepareWrite(originalPayload, originalPayload, devGrant);
      const raw = prepared.bytes;

      const writer = new NDEFReader();
      await writer.write(
        {
          records: [
            {
              recordType: "unknown",
              data: raw.buffer.slice(
                raw.byteOffset,
                raw.byteOffset + raw.byteLength,
              ) as ArrayBuffer,
            },
          ],
        },
        { signal: abortRef.current.signal, overwrite: true },
      );
    } catch (e) {
      setPhase("error");
      setErrorMsg(`${e instanceof DOMException ? e.message : String(e)}`);
      return;
    }

    // Show the original (plaintext) payload — not the encrypted bytes
    setReadPayload(originalPayload);
    setSerialNumber(null);
    setPhase("done");
  }, [name, userId, balance, expiresOffset, tenantId]);

  const handleRetry = useCallback(() => {
    if (drawerMode === "read") handleRead();
    else handleIssue();
  }, [drawerMode, handleRead, handleIssue]);

  return (
    <div className="min-h-screen bg-background p-4 max-w-lg mx-auto space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Issuance Test</h1>
        <p className="text-sm text-muted-foreground">
          Read &amp; write NFC card payload — no auth required. Dev/LAN testing only.
        </p>
      </div>

      {!nfcAvailable && (
        <div className="rounded-md border border-destructive p-3 text-sm text-destructive">
          Web NFC is not supported on this browser/device. Use Chrome on Android.
        </div>
      )}

      <Separator />

      {/* ── WRITE: Issue fresh card ─────────────────────────────────────── */}
      <section className="space-y-3">
        <h2 className="font-semibold">Issue kartu baru</h2>

        <div className="rounded-md border border-blue-200 bg-blue-50 p-3 space-y-1.5">
          <Label htmlFor="it-tenant" className="text-xs font-semibold text-blue-700">
            Tenant ID (harus sama dengan station/gate)
          </Label>
          <Input
            id="it-tenant"
            value={tenantId}
            onChange={(e) => setTenantId(e.target.value)}
            placeholder="Tenant ID"
            className="font-mono text-sm"
          />
          <p className="text-xs text-blue-600">
            Gunakan tenant ID yang sama dengan akun station/gate agar kartu bisa dibaca lintas
            perangkat.
          </p>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div className="col-span-2 space-y-1">
            <Label htmlFor="it-name">Nama</Label>
            <Input
              id="it-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Nama pemegang kartu"
            />
          </div>

          <div className="space-y-1">
            <Label htmlFor="it-userid">User ID</Label>
            <Input
              id="it-userid"
              type="number"
              min={1}
              value={userId}
              onChange={(e) => setUserId(e.target.value)}
            />
          </div>

          <div className="space-y-1">
            <Label htmlFor="it-balance">Saldo awal (Rp)</Label>
            <Input
              id="it-balance"
              type="number"
              min={0}
              value={balance}
              onChange={(e) => setBalance(e.target.value)}
            />
          </div>

          <div className="space-y-1">
            <Label htmlFor="it-expires">Berlaku (hari)</Label>
            <Input
              id="it-expires"
              type="number"
              min={1}
              value={expiresOffset}
              onChange={(e) => setExpiresOffset(e.target.value)}
            />
          </div>
        </div>

        <Button disabled={!nfcAvailable} onClick={handleIssue} className="w-full">
          Tulis ke kartu
        </Button>
      </section>

      <Separator />

      {/* ── READ ───────────────────────────────────────────────────────── */}
      <section className="space-y-3">
        <h2 className="font-semibold">Baca kartu</h2>
        <Button variant="outline" disabled={!nfcAvailable} onClick={handleRead} className="w-full">
          Scan kartu
        </Button>
      </section>

      <IssuanceScanDrawer
        open={isDrawerOpen}
        onOpenChange={setIsDrawerOpen}
        phase={phase}
        mode={drawerMode}
        payload={readPayload}
        serialNumber={serialNumber}
        error={errorMsg}
        onClose={handleDrawerClose}
        onRetry={handleRetry}
      />
    </div>
  );
}
