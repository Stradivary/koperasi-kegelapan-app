import { ClipboardList } from "lucide-react";

export interface AdminAuditEntry {
  id: number;
  type: string;
  amount: number;
  balanceAfter: number;
  timestamp: number;
  flagged: boolean;
}

interface AdminAuditPanelProps {
  entries: AdminAuditEntry[];
  isLoading: boolean;
  error: string | null;
}

export function AdminAuditPanel({ entries, isLoading, error }: AdminAuditPanelProps) {
  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-lg font-semibold text-foreground">Audit Log</h2>
        <p className="text-sm text-muted-foreground mt-0.5">{entries.length} entri terbaru</p>
      </div>
      {isLoading && (
        <div className="rounded-lg border divide-y">
          {[1, 2, 3, 4].map((i) => (
            <div
              key={i}
              className="px-4 py-3 flex items-center justify-between gap-3 animate-pulse"
            >
              <div className="h-3 w-24 bg-muted rounded" />
              <div className="space-y-2 text-right">
                <div className="h-3 w-20 bg-muted rounded ml-auto" />
                <div className="h-2.5 w-32 bg-muted rounded ml-auto" />
              </div>
            </div>
          ))}
        </div>
      )}
      {error && <p className="text-sm text-destructive">{error}</p>}
      {!isLoading && !error && (
        <div className="rounded-lg border divide-y overflow-hidden text-sm">
          {entries.map((entry) => (
            <div
              key={entry.id}
              className="px-4 py-3 flex items-center justify-between gap-3 hover:bg-muted/30 transition-colors"
            >
              <div className="flex items-center gap-2">
                <span className="font-medium capitalize">{entry.type}</span>
                {entry.flagged && (
                  <span className="text-xs bg-destructive/10 text-destructive px-1.5 py-0.5 rounded-full font-medium">
                    flagged
                  </span>
                )}
              </div>
              <div className="text-right text-xs text-muted-foreground shrink-0">
                <p className="font-semibold text-sm text-foreground">
                  Rp {entry.amount?.toLocaleString("id-ID")}
                </p>
                <p>{new Date(entry.timestamp * 1000).toLocaleString("id-ID")}</p>
              </div>
            </div>
          ))}
          {entries.length === 0 && (
            <div className="flex flex-col items-center gap-2 py-12 text-center">
              <ClipboardList size={32} className="text-muted-foreground/40" />
              <p className="text-sm text-muted-foreground">Belum ada transaksi tercatat</p>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
