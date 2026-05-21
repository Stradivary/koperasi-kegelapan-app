import {
  AlertTriangle,
  CheckCircle2,
  Circle,
  Cloud,
  CloudOff,
  Info,
  RefreshCw,
  Trash2,
  Upload,
  Users,
  CreditCard,
  Receipt,
  XCircle,
} from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { useSyncLogs } from "../../hooks/useSyncLogs";
import { useAdminTenantSync } from "../../hooks/useAdminTenantSync";
import { useSyncEngineContext } from "../../hooks/SyncEngineContext";
import { clearSyncLogs, type SyncLogLevel } from "../../lib/syncLogStore";
import { localTenantConfigStore, type LocalTenantConfig } from "../../lib/indexeddb";
import { localDb } from "../../db/local-db";
import { getAccessToken } from "../../lib/api";
import { Button } from "../ui/button";

interface SettingsSectionProps {
  tenantId: string;
}

const LEVEL_CONFIG: Record<SyncLogLevel, { icon: React.ElementType; color: string; bg: string }> = {
  info: { icon: Info, color: "text-blue-600", bg: "bg-blue-50" },
  warn: { icon: AlertTriangle, color: "text-amber-600", bg: "bg-amber-50" },
  error: { icon: XCircle, color: "text-red-600", bg: "bg-red-50" },
};

function formatTimestamp(ts: number): string {
  return new Date(ts).toLocaleTimeString("id-ID", {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
}

export function SettingsSection({ tenantId }: SettingsSectionProps) {
  const logs = useSyncLogs();
  const { onSyncToServer, isSyncingToServer } = useAdminTenantSync(tenantId);
  const syncEngine = useSyncEngineContext();
  const [tenantConfig, setTenantConfig] = useState<LocalTenantConfig | null>(null);
  const [syncStats, setSyncStats] = useState<{
    membersSynced: number;
    membersTotal: number;
    cardsSynced: number;
    cardsTotal: number;
    txSynced: number;
    txTotal: number;
  } | null>(null);

  const refreshSyncStats = useCallback(async () => {
    try {
      const [membersTotal, membersSynced, cardsTotal, cardsSynced, txTotal, txSynced] =
        await Promise.all([
          localDb.users.where("tenantId").equals(tenantId).count(),
          localDb.users.where("[tenantId+syncStatus]").equals([tenantId, "synced"]).count(),
          localDb.cards.where("tenantId").equals(tenantId).count(),
          localDb.cards.where("[tenantId+syncStatus]").equals([tenantId, "synced"]).count(),
          localDb.transactionLog
            .where("[tenantId+syncStatus]")
            .between([tenantId, ""], [tenantId, "\uffff"], true, true)
            .count(),
          localDb.transactionLog
            .where("[tenantId+syncStatus]")
            .equals([tenantId, "synced"])
            .count(),
        ]);
      setSyncStats({ membersSynced, membersTotal, cardsSynced, cardsTotal, txSynced, txTotal });
    } catch {
      // Non-critical
    }
  }, [tenantId]);

  useEffect(() => {
    localTenantConfigStore.get(tenantId).then((cfg) => setTenantConfig(cfg ?? null));
    refreshSyncStats();
  }, [tenantId, refreshSyncStats]);

  // Refresh config after sync completes
  useEffect(() => {
    if (!isSyncingToServer) {
      localTenantConfigStore.get(tenantId).then((cfg) => setTenantConfig(cfg ?? null));
      refreshSyncStats();
    }
  }, [isSyncingToServer, tenantId, refreshSyncStats]);

  return (
    <div className="space-y-6">
      {/* Tenant Sync Status */}
      <section>
        <div className="flex items-center justify-between mb-4">
          <div>
            <h2 className="type-title-bold text-foreground">Sinkronisasi Tenant</h2>
            <p className="type-body2 text-muted-foreground mt-0.5">
              Status koneksi tenant dengan server
            </p>
          </div>
        </div>

        <div className="rounded-lg border p-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              {tenantConfig?.mode === "synced" ? (
                <div className="rounded-full p-2 bg-green-50">
                  <Cloud size={18} className="text-green-600" />
                </div>
              ) : (
                <div className="rounded-full p-2 bg-amber-50">
                  <CloudOff size={18} className="text-amber-600" />
                </div>
              )}
              <div>
                <p className="type-body1 text-foreground">
                  {tenantConfig?.mode === "synced" ? "Tersinkronisasi" : "Lokal saja"}
                </p>
                <p className="type-body2 text-muted-foreground">
                  {tenantConfig?.mode === "synced"
                    ? `Terakhir sync: ${tenantConfig.syncedAt ? new Date(tenantConfig.syncedAt).toLocaleString("id-ID") : "-"}`
                    : "Tenant belum terdaftar di server"}
                </p>
              </div>
            </div>

            {onSyncToServer && (
              <Button onClick={onSyncToServer} disabled={isSyncingToServer} className="gap-1.5">
                <Upload size={14} />
                {isSyncingToServer ? "Menyinkronkan..." : "Push ke Server"}
              </Button>
            )}
          </div>
        </div>

        {/* Sync Checklist */}
        {syncStats && (
          <div className="rounded-lg border mt-3 divide-y">
            {/* Server registration */}
            <ChecklistItem
              icon={Cloud}
              label="Tenant terdaftar di server"
              checked={tenantConfig?.mode === "synced"}
            />
            {/* Auth token */}
            <ChecklistItem
              icon={Cloud}
              label="Token autentikasi aktif"
              checked={!!getAccessToken()}
              detail={getAccessToken() ? undefined : "Login ulang untuk mendapatkan token"}
            />
            {/* Members synced */}
            <ChecklistItem
              icon={Users}
              label="Anggota tersinkronisasi"
              checked={
                syncStats.membersTotal > 0 && syncStats.membersSynced === syncStats.membersTotal
              }
              detail={`${syncStats.membersSynced} / ${syncStats.membersTotal} synced`}
            />
            {/* Cards synced */}
            <ChecklistItem
              icon={CreditCard}
              label="Kartu tersinkronisasi"
              checked={syncStats.cardsTotal > 0 && syncStats.cardsSynced === syncStats.cardsTotal}
              detail={`${syncStats.cardsSynced} / ${syncStats.cardsTotal} synced`}
            />
            {/* Transactions synced */}
            <ChecklistItem
              icon={Receipt}
              label="Transaksi tersinkronisasi"
              checked={syncStats.txTotal > 0 && syncStats.txSynced === syncStats.txTotal}
              detail={`${syncStats.txSynced} / ${syncStats.txTotal} synced`}
            />
          </div>
        )}

        {/* Retry Sync Button */}
        {syncEngine && (
          <div className="mt-3">
            <Button
              variant="outline"
              className="w-full gap-2"
              onClick={() => {
                syncEngine.triggerSync();
                // Refresh stats after a short delay to reflect changes
                setTimeout(refreshSyncStats, 3000);
              }}
              disabled={syncEngine.syncStatus === "pushing" || syncEngine.syncStatus === "pulling"}
            >
              <RefreshCw
                size={14}
                className={
                  syncEngine.syncStatus === "pushing" || syncEngine.syncStatus === "pulling"
                    ? "animate-spin"
                    : ""
                }
              />
              {syncEngine.syncStatus === "pushing" || syncEngine.syncStatus === "pulling"
                ? "Menyinkronkan..."
                : "Retry Sync"}
            </Button>
            {syncEngine.lastSyncedAt && (
              <p className="type-body2 text-muted-foreground text-center mt-1.5">
                Terakhir berhasil: {new Date(syncEngine.lastSyncedAt).toLocaleString("id-ID")}
              </p>
            )}
          </div>
        )}
      </section>

      {/* Sync Logs Panel */}
      <section>
        <div className="flex items-center justify-between mb-4">
          <div>
            <h2 className="type-title-bold text-foreground">Log Sinkronisasi</h2>
            <p className="type-body2 text-muted-foreground mt-0.5">
              Riwayat kegagalan dan peringatan sinkronisasi data
            </p>
          </div>
          <Button
            variant="outline"
            size="sm"
            onClick={clearSyncLogs}
            disabled={logs.length === 0}
            className="gap-1.5"
          >
            <Trash2 size={14} />
            Hapus Log
          </Button>
        </div>

        {logs.length === 0 ? (
          <div className="rounded-lg border border-dashed p-8 text-center">
            <RefreshCw size={32} className="mx-auto text-muted-foreground/40 mb-3" />
            <p className="type-body1 text-muted-foreground">Tidak ada log sinkronisasi</p>
            <p className="type-body2 text-muted-foreground/70 mt-1">
              Log akan muncul di sini ketika terjadi kegagalan sync
            </p>
          </div>
        ) : (
          <div className="rounded-lg border divide-y max-h-[60vh] overflow-y-auto">
            {logs.map((entry) => {
              const config = LEVEL_CONFIG[entry.level];
              const Icon = config.icon;

              return (
                <div key={entry.id} className="flex items-start gap-3 px-4 py-3">
                  <div className={`mt-0.5 rounded-full p-1 ${config.bg}`}>
                    <Icon size={14} className={config.color} />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="type-body1 text-foreground">{entry.message}</span>
                      <span className="type-body2 text-muted-foreground shrink-0">
                        {formatTimestamp(entry.timestamp)}
                      </span>
                    </div>
                    {entry.details && (
                      <p className="type-body2 text-muted-foreground mt-1 font-mono text-xs bg-muted/50 rounded px-2 py-1 whitespace-pre-wrap break-all">
                        {entry.details}
                      </p>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </section>
    </div>
  );
}

// ── ChecklistItem sub-component ──────────────────────────────────────────────

interface ChecklistItemProps {
  icon: React.ElementType;
  label: string;
  checked: boolean;
  detail?: string;
}

function ChecklistItem({ icon: Icon, label, checked, detail }: ChecklistItemProps) {
  return (
    <div className="flex items-center gap-3 px-4 py-3">
      {checked ? (
        <CheckCircle2 size={18} className="text-green-600 shrink-0" />
      ) : (
        <Circle size={18} className="text-muted-foreground/40 shrink-0" />
      )}
      <Icon size={16} className="text-muted-foreground shrink-0" />
      <div className="flex-1 min-w-0">
        <p className={`type-body1 ${checked ? "text-foreground" : "text-muted-foreground"}`}>
          {label}
        </p>
        {detail && <p className="type-body2 text-muted-foreground">{detail}</p>}
      </div>
    </div>
  );
}
