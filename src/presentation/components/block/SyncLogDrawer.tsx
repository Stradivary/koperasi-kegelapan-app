/**
 * Hidden "easter egg" sync log drawer.
 *
 * Shows detailed sync status and log entries from the in-memory syncLogStore.
 * Triggered by long-pressing (3s hold) on the sync status area in Settings.
 * Useful for debugging sync issues without needing Cloudflare dashboard access.
 */

import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from "react";
import { Bug, CircleAlert, CircleCheck, Info, Trash2, TriangleAlert } from "lucide-react";
import {
  getSyncLogs,
  subscribeSyncLogs,
  clearSyncLogs,
  type SyncLogEntry,
} from "#/infrastructure/persistence/dexie/syncLogStore";
import type { SyncEngineStatus } from "#/presentation/hooks/useSyncEngine";
import {
  Drawer,
  DrawerContent,
  DrawerHeader,
  DrawerTitle,
  DrawerDescription,
  DrawerFooter,
} from "../ui/drawer";
import { Button } from "../ui/button";

// ── Hook: subscribe to sync log store reactively ──────────────────────────────

function useSyncLogs(): readonly SyncLogEntry[] {
  return useSyncExternalStore(subscribeSyncLogs, getSyncLogs, getSyncLogs);
}

// ── Hook: long-press gesture ──────────────────────────────────────────────────

function useLongPress(callback: () => void, ms = 3000) {
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const callbackRef = useRef(callback);
  callbackRef.current = callback;

  const start = useCallback(() => {
    timerRef.current = setTimeout(() => {
      callbackRef.current();
    }, ms);
  }, [ms]);

  const cancel = useCallback(() => {
    if (timerRef.current) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }
  }, []);

  useEffect(() => cancel, [cancel]);

  return { onPointerDown: start, onPointerUp: cancel, onPointerLeave: cancel };
}

// ── Sub-components ────────────────────────────────────────────────────────────

function StatusBadge({ status }: { status: SyncEngineStatus | undefined }) {
  const config: Record<string, { label: string; className: string }> = {
    idle: { label: "Idle", className: "bg-green-100 text-green-700" },
    pushing: { label: "Pushing", className: "bg-blue-100 text-blue-700" },
    pulling: { label: "Pulling", className: "bg-blue-100 text-blue-700" },
    error: { label: "Error", className: "bg-red-100 text-red-700" },
    offline: { label: "Offline", className: "bg-yellow-100 text-yellow-700" },
  };
  const { label, className } = config[status ?? "idle"] ?? config.idle;
  return <span className={`text-xs font-medium px-2 py-0.5 rounded ${className}`}>{label}</span>;
}

function LogIcon({ level }: { level: SyncLogEntry["level"] }) {
  switch (level) {
    case "error":
      return <CircleAlert size={12} className="text-red-500 shrink-0 mt-0.5" />;
    case "warn":
      return <TriangleAlert size={12} className="text-yellow-500 shrink-0 mt-0.5" />;
    default:
      return <CircleCheck size={12} className="text-green-500 shrink-0 mt-0.5" />;
  }
}

function LogEntry({ entry }: { entry: SyncLogEntry }) {
  const time = new Date(entry.timestamp).toLocaleTimeString("id-ID", {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });

  return (
    <div className="flex gap-2 px-3 py-2 border-b border-border/50 last:border-0">
      <LogIcon level={entry.level} />
      <div className="flex-1 min-w-0">
        <div className="flex items-center justify-between gap-2">
          <p className="text-xs font-medium text-foreground truncate">{entry.message}</p>
          <span className="text-[10px] text-muted-foreground shrink-0 font-mono">{time}</span>
        </div>
        {entry.details && (
          <p className="text-[10px] text-muted-foreground font-mono mt-0.5 break-all line-clamp-3">
            {entry.details}
          </p>
        )}
      </div>
    </div>
  );
}

// ── Main component ────────────────────────────────────────────────────────────

interface SyncLogDrawerProps {
  syncStatus?: SyncEngineStatus;
  lastSyncedAt?: number | null;
  pendingCount?: number;
}

/**
 * SyncLogDrawer — an easter egg panel showing raw sync logs.
 *
 * Usage: wrap a trigger element with the returned `triggerProps` spread.
 * Long-pressing (3s) on the element opens the drawer.
 *
 * ```tsx
 * const { open, triggerProps, drawerElement } = useSyncLogDrawer({ syncStatus, lastSyncedAt });
 * return (
 *   <>
 *     <div {...triggerProps}>Something</div>
 *     {drawerElement}
 *   </>
 * );
 * ```
 */
export function useSyncLogDrawer(props: SyncLogDrawerProps) {
  const [open, setOpen] = useState(false);
  const logs = useSyncLogs();

  const triggerProps = useLongPress(() => setOpen(true), 3000);

  const drawerElement = (
    <Drawer open={open} onOpenChange={setOpen} direction="bottom">
      <DrawerContent className="max-h-[80dvh]">
        <DrawerHeader>
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Bug size={16} className="text-muted-foreground" />
              <DrawerTitle className="text-sm">Sync Log</DrawerTitle>
            </div>
            <StatusBadge status={props.syncStatus} />
          </div>
          <DrawerDescription className="text-xs">
            {props.lastSyncedAt
              ? `Terakhir sync: ${new Date(props.lastSyncedAt).toLocaleString("id-ID")}`
              : "Belum pernah sync"}
            {props.pendingCount != null && props.pendingCount > 0
              ? ` · ${props.pendingCount} pending`
              : ""}
          </DrawerDescription>
        </DrawerHeader>

        {/* Log entries */}
        <div className="flex-1 overflow-y-auto min-h-0 px-1">
          {logs.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-10 text-muted-foreground">
              <Info size={24} className="mb-2 opacity-40" />
              <p className="text-xs">Belum ada log sync</p>
            </div>
          ) : (
            <div className="divide-y-0">
              {logs.map((entry) => (
                <LogEntry key={entry.id} entry={entry} />
              ))}
            </div>
          )}
        </div>

        <DrawerFooter className="pt-2">
          <Button
            variant="ghost"
            size="sm"
            className="w-full text-xs text-muted-foreground gap-1.5"
            onClick={() => {
              clearSyncLogs();
            }}
          >
            <Trash2 size={12} />
            Hapus semua log
          </Button>
        </DrawerFooter>
      </DrawerContent>
    </Drawer>
  );

  return { open, triggerProps, drawerElement };
}
