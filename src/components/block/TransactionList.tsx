import type { LogEntry } from "../../core/payload/types";

interface TransactionListProps {
  entries: LogEntry[];
  sessionStart: number;
}

const FLAG_LABELS: Record<number, string> = {
  0x00: "Debit",
  0x01: "Credit",
  0x02: "Check-in",
  0x03: "Check-out",
  0x04: "Admin",
};

export function TransactionList({ entries, sessionStart }: TransactionListProps) {
  const valid = entries.filter((e) => e.deltaTime > 0 || e.amount > 0);
  if (valid.length === 0) return null;

  return (
    <div className="space-y-1">
      <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
        Recent Transactions
      </p>
      <div className="rounded-lg border divide-y text-sm">
        {valid.map((entry, i) => {
          const txTime =
            sessionStart > 0
              ? new Date((sessionStart + entry.deltaTime) * 1000).toLocaleTimeString()
              : `+${entry.deltaTime}s`;
          return (
            <div key={i} className="px-3 py-2 flex items-center justify-between">
              <div>
                <span className="text-xs">{FLAG_LABELS[entry.flags & 0x0f] ?? "Unknown"}</span>
                <span className="ml-2 text-xs text-muted-foreground">{txTime}</span>
              </div>
              <span className="font-medium">Rp {entry.amount.toLocaleString()}</span>
            </div>
          );
        })}
      </div>
    </div>
  );
}
