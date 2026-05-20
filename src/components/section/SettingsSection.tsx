import {
  AlertTriangle,
  Cloud,
  CloudOff,
  Info,
  RefreshCw,
  Trash2,
  Upload,
  XCircle,
} from "lucide-react";
import { useEffect, useState } from "react";
import { useSyncLogs } from "../../hooks/useSyncLogs";
import { useAdminTenantSync } from "../../hooks/useAdminTenantSync";
import { clearSyncLogs, type SyncLogLevel } from "../../lib/syncLogStore";
import { localTenantConfigStore, type LocalTenantConfig } from "../../lib/indexeddb";
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
  const [tenantConfig, setTenantConfig] = useState<LocalTenantConfig | null>(null);

  useEffect(() => {
    localTenantConfigStore.get(tenantId).then((cfg) => setTenantConfig(cfg ?? null));
  }, [tenantId]);

  // Refresh config after sync completes
  useEffect(() => {
    if (!isSyncingToServer) {
      localTenantConfigStore.get(tenantId).then((cfg) => setTenantConfig(cfg ?? null));
    }
  }, [isSyncingToServer, tenantId]);

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
