import { Skeleton } from "#/components/ui/skeleton.tsx";

interface DataTableSkeletonProps {
  /** Number of columns to simulate */
  columns?: number;
  /** Number of rows to simulate */
  rows?: number;
  /** Whether to show in mobile (card) mode */
  isMobile?: boolean;
}

export function DataTableSkeleton({
  columns = 4,
  rows = 5,
  isMobile = false,
}: DataTableSkeletonProps) {
  if (isMobile) {
    return (
      <div className="space-y-2">
        {Array.from({ length: rows }).map((_, i) => (
          <div key={i} className="rounded-xl border p-4 space-y-2">
            <div className="flex items-center gap-3">
              <Skeleton className="size-9 rounded-lg" />
              <div className="flex-1 space-y-1.5">
                <Skeleton className="h-3.5 w-2/3" />
                <Skeleton className="h-3 w-1/3" />
              </div>
            </div>
          </div>
        ))}
      </div>
    );
  }

  return (
    <div className="rounded-lg border overflow-hidden">
      {/* Header */}
      <div className="flex items-center gap-2 px-3 py-2.5 border-b bg-muted/30">
        {Array.from({ length: columns }).map((_, i) => (
          <Skeleton key={i} className="h-3.5 flex-1" />
        ))}
      </div>
      {/* Rows */}
      {Array.from({ length: rows }).map((_, i) => (
        <div key={i} className="flex items-center gap-2 px-3 py-3 border-b last:border-b-0">
          {Array.from({ length: columns }).map((_, j) => (
            <Skeleton key={j} className="h-3.5 flex-1" />
          ))}
        </div>
      ))}
    </div>
  );
}
