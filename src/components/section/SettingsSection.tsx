import { AlertTriangle, Info, RefreshCw, Trash2, XCircle } from "lucide-react";
import { useSyncLogs } from "../../hooks/useSyncLogs";
import { clearSyncLogs, type SyncLogLevel } from "../../lib/syncLogStore";
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

export function SettingsSection({ tenantId: _tenantId }: SettingsSectionProps) {
  const logs = useSyncLogs();

  return (
    <div className="space-y-6">
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
                      <p className="type-body2 text-muted-foreground mt-0.5 truncate">
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
