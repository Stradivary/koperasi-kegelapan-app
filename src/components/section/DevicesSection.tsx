import { useNavigate } from "@tanstack/react-router";
import { useState, useEffect, useCallback } from "react";
import {
  RefreshCw,
  ArrowRight,
  Trash2,
  HardDrive,
  Server,
  WifiOff,
  Clock,
  AlertCircle,
} from "lucide-react";
import {
  tenantContextStore,
  localTenantConfigStore,
  reconciliationOutbox,
  type TenantContext,
  type LocalTenantConfig,
} from "../../lib/indexeddb";
import { API_BASE_URL } from "../../lib/api";
import { AuthLayout } from "../layout/AuthLayout";
import { Button } from "../ui/button";
import { LoadingState } from "../block/LoadingState";

interface TenantEntry {
  context: TenantContext | null;
  config: LocalTenantConfig | null;
  pendingCount: number;
}

const ROLE_LABELS: Record<string, string> = {
  admin: "Admin",
  station: "Stasiun",
  gate: "Gerbang",
  terminal: "Terminal",
  kiosk: "Kiosk",
  scout: "Buku Saku",
};

const ROLE_ROUTES: Record<string, string> = {
  admin: "admin",
  station: "station",
  gate: "gate",
  terminal: "terminal",
  kiosk: "kiosk",
  scout: "scout",
};

function formatRelativeTime(ts: number): string {
  const diff = Date.now() - ts;
  const mins = Math.floor(diff / 60_000);
  if (mins < 1) return "baru saja";
  if (mins < 60) return `${mins} menit lalu`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours} jam lalu`;
  const days = Math.floor(hours / 24);
  return `${days} hari lalu`;
}

export function DevicesSection() {
  const navigate = useNavigate();
  const [entries, setEntries] = useState<TenantEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [contexts, configs] = await Promise.all([
        tenantContextStore.getAll(),
        localTenantConfigStore.getAll(),
      ]);

      const allTenantIds = new Set([
        ...contexts.map((c) => c.tenantId),
        ...configs.map((c) => c.tenantId),
      ]);

      const result: TenantEntry[] = await Promise.all(
        [...allTenantIds].map(async (tenantId) => {
          const context = contexts.find((c) => c.tenantId === tenantId) ?? null;
          const config = configs.find((c) => c.tenantId === tenantId) ?? null;
          const pending = await reconciliationOutbox.getPending(tenantId);
          return { context, config, pendingCount: pending.length };
        }),
      );

      setEntries(result);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  async function handleSync(entry: TenantEntry) {
    if (!entry.context) return;
    setSyncing(entry.context.tenantId);
    try {
      const pending = await reconciliationOutbox.getPending(entry.context.tenantId);
      if (pending.length === 0) {
        await load();
        return;
      }
      const res = await fetch(`${API_BASE_URL}/api/reconcile`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ terminalId: 0, events: pending }),
      });
      if (res.ok) {
        await Promise.all(pending.map((e) => reconciliationOutbox.markSynced(e.idempotencyKey)));
      }
    } finally {
      setSyncing(null);
      await load();
    }
  }

  async function handleRemove(tenantId: string) {
    await tenantContextStore.delete(tenantId);
    await load();
  }

  function handleOpen(entry: TenantEntry) {
    if (!entry.context) return;
    const sub = ROLE_ROUTES[entry.context.role];
    if (sub) navigate({ to: `/tenant/${entry.context.tenantId}/${sub}` });
  }

  const tenantName = (e: TenantEntry) =>
    e.context?.tenantName ?? e.config?.name ?? "Tidak diketahui";
  const tenantSlug = (e: TenantEntry) => e.context?.tenantSlug ?? e.config?.slug ?? "—";

  return (
    <AuthLayout headerSubtitle="Daftar Tenant Perangkat" align="top">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="type-h5 text-foreground">Tenant Terdaftar</h2>
          <p className="type-body2 text-muted-foreground mt-0.5">
            Perangkat ini terdaftar di {entries.length} tenant
          </p>
        </div>
        <Button variant="ghost" size="icon" onClick={load} disabled={loading}>
          <RefreshCw size={16} className={loading ? "animate-spin" : ""} />
        </Button>
      </div>

      {loading ? (
        <LoadingState variant="section" />
      ) : entries.length === 0 ? (
        <div className="py-8 text-center space-y-2">
          <HardDrive size={32} className="mx-auto text-muted-foreground/40" />
          <p className="type-body2 text-muted-foreground">Belum ada tenant terdaftar</p>
        </div>
      ) : (
        <div className="space-y-3">
          {entries.map((entry) => {
            const tid = entry.context?.tenantId ?? entry.config?.tenantId ?? "";
            const mode = entry.config?.mode ?? "synced";
            const isSyncing = syncing === tid;
            return (
              <div key={tid} className="rounded-xl border bg-white p-4 space-y-3">
                {/* Header */}
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="type-title-bold text-foreground truncate">{tenantName(entry)}</p>
                    <p className="type-body2 text-muted-foreground">@{tenantSlug(entry)}</p>
                  </div>
                  <div className="flex items-center gap-1.5 shrink-0">
                    {mode === "local" ? (
                      <span className="inline-flex items-center gap-1 rounded-full bg-amber-50 px-2 py-0.5 text-xs font-medium text-amber-700 border border-amber-200">
                        <HardDrive size={10} />
                        Lokal
                      </span>
                    ) : (
                      <span className="inline-flex items-center gap-1 rounded-full bg-blue-50 px-2 py-0.5 text-xs font-medium text-blue-700 border border-blue-200">
                        <Server size={10} />
                        Synced
                      </span>
                    )}
                  </div>
                </div>

                {/* Role + Sync status */}
                <div className="flex items-center gap-3 flex-wrap">
                  {entry.context && (
                    <span className="inline-flex items-center rounded-full bg-brand/10 px-2.5 py-0.5 text-xs font-medium text-brand">
                      {ROLE_LABELS[entry.context.role] ?? entry.context.role}
                    </span>
                  )}

                  {entry.pendingCount > 0 ? (
                    <span className="inline-flex items-center gap-1 rounded-full bg-signal-bg-error px-2.5 py-0.5 text-xs font-medium text-signal-error border border-signal-error/20">
                      <WifiOff size={10} />
                      {entry.pendingCount} pending
                    </span>
                  ) : (
                    <span className="inline-flex items-center gap-1 rounded-full bg-green-50 px-2.5 py-0.5 text-xs font-medium text-green-700 border border-green-200">
                      Tersinkron
                    </span>
                  )}

                  {entry.context && (
                    <span className="inline-flex items-center gap-1 text-xs text-muted-foreground ml-auto">
                      <Clock size={10} />
                      {formatRelativeTime(entry.context.updatedAt)}
                    </span>
                  )}
                </div>

                {/* Config details */}
                {entry.config?.exportedAt && (
                  <p className="type-body2 text-muted-foreground text-xs">
                    Ekspor terakhir: {formatRelativeTime(entry.config.exportedAt)}
                  </p>
                )}

                {/* Actions */}
                <div className="flex items-center gap-2 pt-1">
                  {entry.context && (
                    <Button size="sm" className="flex-1 gap-1.5" onClick={() => handleOpen(entry)}>
                      Buka
                      <ArrowRight size={14} />
                    </Button>
                  )}

                  {entry.pendingCount > 0 && entry.context && (
                    <Button
                      size="sm"
                      variant="outline"
                      className="gap-1.5"
                      disabled={isSyncing}
                      onClick={() => handleSync(entry)}
                    >
                      <RefreshCw size={13} className={isSyncing ? "animate-spin" : ""} />
                      Sinkron
                    </Button>
                  )}

                  {entry.context && (
                    <Button
                      size="sm"
                      variant="ghost"
                      className="text-signal-error hover:text-signal-error hover:bg-signal-bg-error"
                      onClick={() => handleRemove(tid)}
                    >
                      <Trash2 size={14} />
                    </Button>
                  )}
                </div>

                {!entry.context && (
                  <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                    <AlertCircle size={12} />
                    Belum masuk sebagai perangkat
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      <Button variant="outline" className="w-full" onClick={() => navigate({ to: "/" })}>
        Kembali ke Login
      </Button>
    </AuthLayout>
  );
}
