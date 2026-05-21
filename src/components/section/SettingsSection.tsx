import {
  AlertTriangle,
  CheckCircle2,
  ChevronDown,
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
import { Badge } from "../ui/badge";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "../ui/card";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "../ui/collapsible";

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
  const { onSyncToServer, isSyncingToServer, syncStep, syncError } = useAdminTenantSync(tenantId);
  const syncEngine = useSyncEngineContext();
  const [tenantConfig, setTenantConfig] = useState<LocalTenantConfig | null>(null);
  const [logsOpen, setLogsOpen] = useState(false);
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

  const errorCount = logs.filter((l) => l.level === "error").length;
  const warnCount = logs.filter((l) => l.level === "warn").length;

  return (
    <div className="space-y-6">
      {/* Tenant Sync Status */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle>Sinkronisasi Tenant</CardTitle>
              <CardDescription className="mt-1">
                Status koneksi tenant dengan server
              </CardDescription>
            </div>
            {tenantConfig?.mode === "synced" ? (
              <Badge variant="default" className="bg-green-600 gap-1">
                <Cloud size={12} />
                Tersinkronisasi
              </Badge>
            ) : (
              <Badge variant="secondary" className="gap-1">
                <CloudOff size={12} />
                Lokal
              </Badge>
            )}
          </div>
        </CardHeader>

        <CardContent className="space-y-4">
          {/* Connection status */}
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
                    {tenantConfig?.mode === "synced" ? "Terhubung ke server" : "Belum terdaftar"}
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
                  <Upload size={14} className={isSyncingToServer ? "animate-pulse" : ""} />
                  {isSyncingToServer ? "Menyinkronkan..." : "Push ke Server"}
                </Button>
              )}
            </div>

            {/* Sync progress indicator */}
            {syncStep && syncStep !== "complete" && (
              <div className="mt-3 flex items-center gap-2 text-sm text-muted-foreground border-t pt-3">
                <RefreshCw size={14} className="animate-spin text-blue-500" />
                <span>
                  {syncStep === "syncing-tenant" && "Mendaftarkan tenant ke server..."}
                  {syncStep === "pushing-members" && "Mengirim data anggota..."}
                  {syncStep === "pushing-cards" && "Mengirim data kartu..."}
                  {syncStep === "pushing-transactions" && "Mengirim transaksi..."}
                </span>
              </div>
            )}

            {/* Sync success indicator */}
            {syncStep === "complete" && (
              <div className="mt-3 flex items-center gap-2 text-sm text-green-600 border-t pt-3">
                <CheckCircle2 size={14} />
                <span>Semua data berhasil disinkronkan ke server</span>
              </div>
            )}

            {/* Sync error indicator */}
            {syncError && (
              <div className="mt-3 flex items-center gap-2 text-sm text-red-600 border-t pt-3">
                <XCircle size={14} />
                <span>{syncError}</span>
              </div>
            )}
          </div>

          {/* Sync Checklist */}
          {syncStats && (
            <div className="rounded-lg border divide-y">
              <ChecklistItem
                icon={Cloud}
                label="Tenant terdaftar di server"
                checked={tenantConfig?.mode === "synced"}
              />
              <ChecklistItem
                icon={Cloud}
                label="Token autentikasi aktif"
                checked={!!getAccessToken()}
                detail={getAccessToken() ? undefined : "Login ulang untuk mendapatkan token"}
              />
              <ChecklistItem
                icon={Users}
                label="Anggota tersinkronisasi"
                checked={
                  syncStats.membersTotal > 0 && syncStats.membersSynced === syncStats.membersTotal
                }
                detail={`${syncStats.membersSynced} / ${syncStats.membersTotal} synced`}
              />
              <ChecklistItem
                icon={CreditCard}
                label="Kartu tersinkronisasi"
                checked={syncStats.cardsTotal > 0 && syncStats.cardsSynced === syncStats.cardsTotal}
                detail={`${syncStats.cardsSynced} / ${syncStats.cardsTotal} synced`}
              />
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
            <div>
              <Button
                variant="outline"
                className="w-full gap-2"
                onClick={() => {
                  syncEngine.triggerSync();
                  setTimeout(refreshSyncStats, 3000);
                }}
                disabled={
                  syncEngine.syncStatus === "pushing" || syncEngine.syncStatus === "pulling"
                }
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
        </CardContent>
      </Card>

      {/* Sync Logs Panel — Collapsible */}
      <Card>
        <Collapsible open={logsOpen} onOpenChange={setLogsOpen}>
          <CardHeader className="pb-0">
            <CollapsibleTrigger asChild>
              <button
                type="button"
                className="flex items-center justify-between w-full text-left group cursor-pointer"
              >
                <div className="flex items-center gap-3">
                  <div>
                    <CardTitle className="group-hover:text-foreground/80 transition-colors">
                      Log Sinkronisasi
                    </CardTitle>
                    <CardDescription className="mt-1">
                      Riwayat kegagalan dan peringatan sinkronisasi
                    </CardDescription>
                  </div>
                  {logs.length > 0 && (
                    <div className="flex items-center gap-1.5">
                      {errorCount > 0 && (
                        <Badge variant="destructive" className="text-[11px] px-1.5 py-0">
                          {errorCount} error
                        </Badge>
                      )}
                      {warnCount > 0 && (
                        <Badge
                          variant="secondary"
                          className="text-[11px] px-1.5 py-0 bg-amber-100 text-amber-700 border-amber-200"
                        >
                          {warnCount} warn
                        </Badge>
                      )}
                    </div>
                  )}
                </div>
                <div className="flex items-center gap-2">
                  {logs.length > 0 && (
                    <span className="type-body2 text-muted-foreground">{logs.length} entri</span>
                  )}
                  <ChevronDown
                    size={16}
                    className={`text-muted-foreground transition-transform duration-200 ${logsOpen ? "rotate-180" : ""}`}
                  />
                </div>
              </button>
            </CollapsibleTrigger>
          </CardHeader>

          <CollapsibleContent>
            <CardContent className="pt-4">
              {/* Clear button */}
              {logs.length > 0 && (
                <div className="flex justify-end mb-3">
                  <Button variant="outline" size="sm" onClick={clearSyncLogs} className="gap-1.5">
                    <Trash2 size={14} />
                    Hapus Log
                  </Button>
                </div>
              )}

              {logs.length === 0 ? (
                <div className="rounded-lg border border-dashed p-8 text-center">
                  <RefreshCw size={32} className="mx-auto text-muted-foreground/40 mb-3" />
                  <p className="type-body1 text-muted-foreground">Tidak ada log sinkronisasi</p>
                  <p className="type-body2 text-muted-foreground/70 mt-1">
                    Log akan muncul di sini ketika terjadi kegagalan sync
                  </p>
                </div>
              ) : (
                <div className="rounded-lg border divide-y max-h-[50vh] overflow-y-auto">
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
            </CardContent>
          </CollapsibleContent>
        </Collapsible>
      </Card>
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
