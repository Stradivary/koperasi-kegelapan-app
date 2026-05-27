import { createFileRoute } from "@tanstack/react-router";
import { useState, useRef, useCallback } from "react";
import { Button } from "#/components/ui/button";
import { Input } from "#/components/ui/input";
import { Label } from "#/components/ui/label";
import { Separator } from "#/components/ui/separator";
import { makeFreshCard } from "#/components/section/IssuanceTestSection";
import { prepareWrite } from "#/core/nfc/pipelineEngine";
import { encodePayloadWire } from "#/core/payload/engine";
import type { SessionGrant } from "#/core/payload/types";
import { API_BASE_URL } from "#/lib/api";

export const Route = createFileRoute("/dev/nfc-test")({
  component: NfcTestPage,
});

function toHex(bytes: Uint8Array, maxBytes = 64): string {
  const slice = bytes.slice(0, maxBytes);
  const hex = Array.from(slice)
    .map((b) => b.toString(16).padStart(2, "0"))
    .join(" ");
  return bytes.length > maxBytes ? `${hex} … (+${bytes.length - maxBytes} bytes)` : hex;
}

function ts(): string {
  return new Date().toLocaleTimeString("id-ID", { hour12: false });
}

function NfcTestPage() {
  const [log, setLog] = useState<string[]>(["Ready. Press a button to start."]);
  const [scanning, setScanning] = useState(false);
  const abortRef = useRef<AbortController | null>(null);

  const [payloadName, setPayloadName] = useState("Test User");
  const [payloadUserId, setPayloadUserId] = useState("1");
  const [payloadBalance, setPayloadBalance] = useState("50000");
  const [payloadExpiresOffset, setPayloadExpiresOffset] = useState("365");
  const [payloadTenantId, setPayloadTenantId] = useState("dev");

  const addLog = useCallback((...lines: string[]) => {
    setLog((prev) => [...prev, ...lines.map((l) => `[${ts()}] ${l}`)]);
  }, []);

  const supported = typeof globalThis !== "undefined" && "NDEFReader" in globalThis;

  // ── Scan ──────────────────────────────────────────────────────────────────
  const handleScan = useCallback(async () => {
    if (!supported) {
      addLog("❌ NDEFReader not available");
      return;
    }
    abortRef.current?.abort();
    abortRef.current = new AbortController();
    const signal = abortRef.current.signal;

    setScanning(true);
    addLog("Starting scan… (tap a card)");

    const reader = new NDEFReader();

    reader.addEventListener("reading", (event: NDEFReadingEvent) => {
      // Normalize serial: strip non-hex chars, lowercase — this is the stable hardware UID
      const rawSerial = event.serialNumber || "(none)";
      const normalizedSerial = event.serialNumber
        ? event.serialNumber.replaceAll(/[^a-fA-F0-9]/g, "").toLowerCase()
        : "(none)";
      addLog(
        `✅ Card detected  serial=${rawSerial}  normalized=${normalizedSerial}  records=${event.message.records.length}`,
      );
      event.message.records.forEach((rec, i) => {
        const bytes = rec.data
          ? new Uint8Array(rec.data.buffer, rec.data.byteOffset, rec.data.byteLength)
          : new Uint8Array(0);
        addLog(
          `   [${i}] type="${rec.recordType}"  ${bytes.length} bytes`,
          `       hex: ${toHex(bytes)}`,
        );
      });
    });

    reader.addEventListener("readingerror", (event: NDEFErrorEvent) => {
      addLog(`⚠️  readingerror: ${event.error?.message ?? "(unknown)"}`);
    });

    reader
      .scan({ signal })
      .then(() => addLog("Scan active — waiting for card…"))
      .catch((e: Error) => {
        if (!signal.aborted) addLog(`❌ scan() failed: ${e.message}`);
        setScanning(false);
      });
  }, [supported, addLog]);

  const handleStopScan = useCallback(() => {
    abortRef.current?.abort();
    setScanning(false);
    addLog("Scan stopped.");
  }, [addLog]);

  // ── Write text ────────────────────────────────────────────────────────────
  const handleWriteText = useCallback(async () => {
    if (!supported) {
      addLog("❌ NDEFReader not available");
      return;
    }
    addLog('Writing text record "NFC-TEST" …');
    const writer = new NDEFReader();
    try {
      const enc = new TextEncoder();
      await writer.write(
        { records: [{ recordType: "text", data: enc.encode("NFC-TEST") }] },
        {
          overwrite: true,
        },
      );
      addLog("✅ Write text success — tap card now if writer is waiting");
    } catch (e) {
      addLog(`❌ Write text failed: ${e}`);
    }
  }, [supported, addLog]);

  // ── Write raw unknown ─────────────────────────────────────────────────────
  const handleWriteRaw = useCallback(async () => {
    if (!supported) {
      addLog("❌ NDEFReader not available");
      return;
    }
    const testData = new Uint8Array(32);
    crypto.getRandomValues(testData);
    addLog(`Writing 32 random raw bytes (unknown record) …`, `  hex: ${toHex(testData)}`);
    const writer = new NDEFReader();
    try {
      await writer.write(
        { records: [{ recordType: "unknown", data: testData.buffer }] },
        {
          overwrite: true,
        },
      );
      addLog("✅ Write raw success");
    } catch (e) {
      addLog(`❌ Write raw failed: ${e}`);
    }
  }, [supported, addLog]);

  // ── Write empty (format/clear) ────────────────────────────────────────────
  const handleClear = useCallback(async () => {
    if (!supported) {
      addLog("❌ NDEFReader not available");
      return;
    }
    addLog("Writing empty NDEF message (clears tag) …");
    const writer = new NDEFReader();
    try {
      // An empty records array is invalid; a single empty-type record is the correct way to clear
      await writer.write(
        { records: [{ recordType: "empty", data: new Uint8Array(0) }] },
        { overwrite: true },
      );
      addLog("✅ Clear success");
    } catch (e) {
      addLog(`❌ Clear failed: ${e}`);
    }
  }, [supported, addLog]);

  // ── Write payload ─────────────────────────────────────────────────────────
  const handleWritePayload = useCallback(async () => {
    if (!supported) {
      addLog("❌ NDEFReader not available");
      return;
    }
    let raw: Uint8Array | undefined;
    try {
      const expiresAt =
        Math.floor(Date.now() / 1000) + Number.parseInt(payloadExpiresOffset, 10) * 86400;
      const payload = makeFreshCard({
        name: payloadName,
        userId: payloadUserId,
        balance: Number.parseInt(payloadBalance, 10),
        expiresAt,
      });

      // Try to fetch a session grant for proper encryption
      let useEncrypted = false;
      try {
        const params = new URLSearchParams({
          tenantId: payloadTenantId,
          deviceId: "dev-nfc-test",
          role: "station",
        });
        const res = await fetch(`${API_BASE_URL}/api/session-grant?${params}`);
        if (res.ok) {
          const data = await res.json();
          const b64ToBytes = (b64: string): Uint8Array => {
            const std = b64.replaceAll("-", "+").replaceAll("_", "/");
            const padded = std + "=".repeat((4 - (std.length % 4)) % 4);
            const bin = atob(padded);
            const bytes = new Uint8Array(bin.length);
            for (let i = 0; i < bin.length; i++) bytes[i] = bin.codePointAt(i)!;
            return bytes;
          };
          const grant: SessionGrant = {
            keyVersion: data.keyVersion,
            sessionKey: b64ToBytes(data.sessionKey),
            expiresAt: data.expiresAt,
            allowedOps: data.allowedOps,
            signature: b64ToBytes(data.signature),
            tenantId: payloadTenantId,
            accountId: "dev",
            deviceId: "dev-nfc-test",
          };
          const prepared = await prepareWrite(payload, payload, grant);
          raw = prepared.bytes;
          useEncrypted = true;
        }
      } catch {
        // Fall back to plaintext if grant fetch fails
      }

      if (!useEncrypted) {
        raw = encodePayloadWire(payload);
      }

      addLog(
        `Built payload (${useEncrypted ? "encrypted" : "plaintext"})  name="${payloadName}"  uid=${payloadUserId}  balance=${payloadBalance}  expires+${payloadExpiresOffset}d`,
        `  hex: ${toHex(raw!)}`,
      );
    } catch (e) {
      addLog(`❌ Build failed: ${e}`);
      return;
    }
    if (!raw) {
      addLog("❌ Build failed: no payload generated");
      return;
    }
    addLog(`Writing payload (${raw.length} bytes) …`);
    const writer = new NDEFReader();
    try {
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
        { overwrite: true },
      );
      addLog("✅ Write payload success");
    } catch (e) {
      addLog(`❌ Write payload failed: ${e}`);
    }
  }, [
    supported,
    addLog,
    payloadName,
    payloadUserId,
    payloadBalance,
    payloadExpiresOffset,
    payloadTenantId,
  ]);

  const handleClearLog = useCallback(() => setLog([]), []);

  return (
    <div className="min-h-screen bg-background p-4 max-w-lg mx-auto space-y-6">
      <div>
        <h1 className="text-2xl font-bold">NFC Raw Test</h1>
        <p className="text-sm text-muted-foreground">
          Direct NDEFReader API — no payload encoding. Dev/LAN only.
        </p>
      </div>

      {!supported && (
        <div className="rounded-md border border-destructive p-3 text-sm text-destructive">
          NDEFReader not available. Requires Chrome on Android over HTTPS (or localhost).
        </div>
      )}

      <Separator />

      {/* Scan */}
      <section className="space-y-2">
        <h2 className="font-semibold text-sm text-muted-foreground uppercase tracking-wide">
          Read
        </h2>
        <div className="flex gap-2">
          <Button disabled={!supported || scanning} onClick={handleScan} className="flex-1">
            {scanning ? "Scanning…" : "Scan Card"}
          </Button>
          <Button variant="outline" disabled={!scanning} onClick={handleStopScan}>
            Stop
          </Button>
        </div>
        <p className="text-xs text-muted-foreground">
          Shows raw NDEF records — works on formatted cards only.
          <br />
          <strong>Note:</strong> The normalized serial (hardware UID, hex without separators) is the
          stable card identifier used by the app. Same card = same normalized serial every scan.
        </p>
      </section>

      <Separator />

      {/* Write */}
      <section className="space-y-2">
        <h2 className="font-semibold text-sm text-muted-foreground uppercase tracking-wide">
          Write (tap card when prompted)
        </h2>
        <div className="grid grid-cols-2 gap-2">
          <Button variant="outline" disabled={!supported} onClick={handleWriteText}>
            Write Text
          </Button>
          <Button variant="outline" disabled={!supported} onClick={handleWriteRaw}>
            Write 32 Raw Bytes
          </Button>
        </div>
        <Button
          variant="destructive"
          size="sm"
          disabled={!supported}
          onClick={handleClear}
          className="w-full"
        >
          Format / Clear Tag
        </Button>
        <p className="text-xs text-muted-foreground">
          <strong>Write Text</strong> → NDEF text record (proves basic NDEF write works).
          <br />
          <strong>Write 32 Raw Bytes</strong> → <code>unknown</code> record, same type the app uses.
          <br />
          <strong>Format/Clear</strong> → empty NDEF, useful to reset a bad tag state.
        </p>
      </section>

      <Separator />

      {/* Write payload */}
      <section className="space-y-3">
        <h2 className="font-semibold text-sm text-muted-foreground uppercase tracking-wide">
          Write Payload (tap card when prompted)
        </h2>
        <div className="space-y-2">
          <div className="space-y-1">
            <Label className="text-xs font-semibold text-blue-700">Tenant ID</Label>
            <Input
              value={payloadTenantId}
              onChange={(e) => setPayloadTenantId(e.target.value)}
              placeholder="dev"
              className="font-mono text-sm"
            />
            <p className="text-xs text-muted-foreground">
              Harus sama dengan tenant ID di station/gate agar kartu bisa dibaca.
            </p>
          </div>
        </div>
        <div className="grid grid-cols-2 gap-2">
          <div className="space-y-1">
            <Label className="text-xs">Name</Label>
            <Input
              value={payloadName}
              onChange={(e) => setPayloadName(e.target.value)}
              placeholder="Test User"
            />
          </div>
          <div className="space-y-1">
            <Label className="text-xs">User ID</Label>
            <Input
              value={payloadUserId}
              onChange={(e) => setPayloadUserId(e.target.value)}
              placeholder="1"
            />
          </div>
          <div className="space-y-1">
            <Label className="text-xs">Balance (IDR)</Label>
            <Input
              value={payloadBalance}
              onChange={(e) => setPayloadBalance(e.target.value)}
              placeholder="50000"
            />
          </div>
          <div className="space-y-1">
            <Label className="text-xs">Expires (days)</Label>
            <Input
              value={payloadExpiresOffset}
              onChange={(e) => setPayloadExpiresOffset(e.target.value)}
              placeholder="365"
            />
          </div>
        </div>
        <Button disabled={!supported} onClick={handleWritePayload} className="w-full">
          Write Payload
        </Button>
        <p className="text-xs text-muted-foreground">
          Encodes a full <code>CardPayload</code> via <code>makeFreshCard</code> and writes it as an{" "}
          <code>unknown</code> record.
        </p>
      </section>

      <Separator />

      {/* Log */}
      <section className="space-y-2">
        <div className="flex items-center justify-between">
          <h2 className="font-semibold text-sm text-muted-foreground uppercase tracking-wide">
            Log
          </h2>
          <Button variant="ghost" size="sm" onClick={handleClearLog} className="text-xs h-6">
            Clear
          </Button>
        </div>
        <div className="rounded-md border bg-muted/40 p-3 font-mono text-xs space-y-0.5 max-h-80 overflow-y-auto">
          {log.map((line, i) => (
            <p key={`log-${i}-${line.slice(0, 20)}`} className="whitespace-pre-wrap break-all">
              {line}
            </p>
          ))}
        </div>
      </section>
    </div>
  );
}
