import { useState, useMemo, useCallback, useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { createColumnHelper } from "@tanstack/react-table";
import { getTransactions, type TransactionQuery } from "#/hooks/useTransactionLog";
import { getLocalAccountStore } from "#/hooks/useIndexedDbStores";
import type { TransactionLog } from "#/hooks/types";
import { Badge } from "../ui/badge";
import { Button } from "../ui/button";
import { Input } from "../ui/input";
import { Label } from "../ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "../ui/select";
import {
  ArrowDownLeft,
  ArrowUpRight,
  CheckCircle2,
  Clock,
  AlertCircle,
  X,
  Receipt,
} from "lucide-react";
import { cn } from "#/lib/utils";
import { useIsMobile } from "#/hooks/use-mobile";
import { DataTable } from "../block/data-table";

interface TransactionsSectionProps {
  tenantId: string;
  accountId: string;
}

const PAGE_SIZE_DEFAULT = 10;
const PAGE_SIZE_MAX = 100;

const TYPE_LABELS: Record<TransactionLog["type"], string> = {
  debit: "Debit",
  credit: "Kredit",
  checkin: "Check-in",
  checkout: "Check-out",
  topup: "Top-up",
  admin: "Admin",
};

const TYPE_FILTER_OPTIONS: { label: string; value: TransactionLog["type"] }[] = [
  { label: "Top-up", value: "topup" },
  { label: "Check-in", value: "checkin" },
  { label: "Check-out", value: "checkout" },
];

/** Types that add money to the card (green) */
const CREDIT_TYPES = new Set<TransactionLog["type"]>(["topup", "credit"]);
/** Types that remove money (red) */
const DEBIT_TYPES = new Set<TransactionLog["type"]>(["debit", "checkin", "checkout"]);

function amountColor(type: TransactionLog["type"]) {
  if (CREDIT_TYPES.has(type)) return "text-emerald-600";
  if (DEBIT_TYPES.has(type)) return "text-red-500";
  return "text-foreground";
}

function amountPrefix(type: TransactionLog["type"]) {
  if (CREDIT_TYPES.has(type)) return "+";
  if (DEBIT_TYPES.has(type)) return "−";
  return "";
}

function TypeIcon({
  type,
  className,
}: Readonly<{ type: TransactionLog["type"]; className?: string }>) {
  if (CREDIT_TYPES.has(type))
    return <ArrowDownLeft size={14} className={cn("text-emerald-600", className)} />;
  if (DEBIT_TYPES.has(type))
    return <ArrowUpRight size={14} className={cn("text-red-500", className)} />;
  return <Receipt size={14} className={cn("text-muted-foreground", className)} />;
}

function SyncIcon({ status }: Readonly<{ status: TransactionLog["syncStatus"] }>) {
  if (status === "synced") return <CheckCircle2 size={12} className="text-green-500 shrink-0" />;
  if (status === "pending") return <Clock size={12} className="text-amber-500 shrink-0" />;
  return <AlertCircle size={12} className="text-destructive shrink-0" />;
}

const SYNC_STATUS_VARIANT: Record<
  TransactionLog["syncStatus"],
  "default" | "secondary" | "destructive"
> = {
  pending: "secondary",
  synced: "default",
  conflict: "destructive",
  failed: "destructive",
};

const SYNC_STATUS_LABELS: Record<TransactionLog["syncStatus"], string> = {
  pending: "Pending",
  synced: "Synced",
  conflict: "Conflict",
  failed: "Failed",
};

interface TransactionRow extends TransactionLog {
  operatorName: string | null;
}

function formatDateTime(timestamp: number): string {
  const date = new Date(timestamp * 1000);
  return date.toLocaleString("id-ID", {
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
}

function formatAmount(amount: number): string {
  return amount.toLocaleString("id-ID");
}

const columnHelper = createColumnHelper<TransactionRow>();

const columns = [
  columnHelper.accessor("timestamp", {
    header: "Waktu",
    cell: (info) => <span className="text-xs">{formatDateTime(info.getValue())}</span>,
  }),
  columnHelper.accessor("cardId", {
    header: "Card ID",
    cell: (info) => {
      const cardName = info.row.original.cardName;
      return (
        <div className="min-w-0">
          {cardName && <div className="text-xs font-medium truncate">{cardName}</div>}
          <span className="font-mono text-xs text-muted-foreground">{info.getValue()}</span>
        </div>
      );
    },
  }),
  columnHelper.accessor("operatorName", {
    header: "Operator",
    cell: (info) => (
      <div className="min-w-0">
        <div className="text-xs font-medium truncate">
          {info.getValue() ?? "Operator tidak ditemukan"}
        </div>
      </div>
    ),
  }),
  columnHelper.accessor("type", {
    header: "Tipe",
    cell: (info) => (
      <Badge variant="outline">{TYPE_LABELS[info.getValue()] ?? info.getValue()}</Badge>
    ),
  }),
  columnHelper.accessor("amount", {
    header: () => <span className="text-right w-full block">Jumlah</span>,
    cell: (info) => {
      const type = info.row.original.type;
      return (
        <span className={cn("text-right block font-mono text-xs font-semibold", amountColor(type))}>
          {amountPrefix(type)}Rp {formatAmount(info.getValue())}
        </span>
      );
    },
  }),
  columnHelper.accessor("balanceAfter", {
    header: () => <span className="text-right w-full block">Saldo</span>,
    cell: (info) => (
      <span className="text-right block font-mono text-xs text-emerald-600 font-medium">
        Rp {formatAmount(info.getValue())}
      </span>
    ),
  }),
  columnHelper.accessor("syncStatus", {
    header: "Sync",
    cell: (info) => {
      const status = info.getValue();
      return <Badge variant={SYNC_STATUS_VARIANT[status]}>{SYNC_STATUS_LABELS[status]}</Badge>;
    },
  }),
];

export function TransactionsSection({ tenantId, accountId }: Readonly<TransactionsSectionProps>) {
  const isMobile = useIsMobile();
  const responsivePageSize = isMobile ? 5 : PAGE_SIZE_DEFAULT;

  const [page, setPage] = useState(1);

  // Reset to page 1 when switching between mobile/desktop page sizes
  useEffect(() => {
    setPage(1);
  }, [responsivePageSize]);

  const [cardIdFilter, setCardIdFilter] = useState("");
  const [typeFilter, setTypeFilter] = useState<TransactionLog["type"] | "">("");

  const todayStr = useMemo(() => {
    const d = new Date();
    const yyyy = d.getFullYear();
    const mm = String(d.getMonth() + 1).padStart(2, "0");
    const dd = String(d.getDate()).padStart(2, "0");
    return `${yyyy}-${mm}-${dd}`;
  }, []);

  const [dateFrom, setDateFrom] = useState(todayStr);
  const [dateTo, setDateTo] = useState(todayStr);

  const clampedPageSize = useMemo(
    () => Math.min(Math.max(1, responsivePageSize), PAGE_SIZE_MAX),
    [responsivePageSize],
  );

  const dateFromTimestamp = useMemo(() => {
    if (!dateFrom) return undefined;
    const d = new Date(dateFrom);
    if (Number.isNaN(d.getTime())) return undefined;
    d.setHours(0, 0, 0, 0);
    return Math.floor(d.getTime() / 1000);
  }, [dateFrom]);

  const dateToTimestamp = useMemo(() => {
    if (!dateTo) return undefined;
    const d = new Date(dateTo);
    if (Number.isNaN(d.getTime())) return undefined;
    d.setHours(23, 59, 59, 999);
    return Math.floor(d.getTime() / 1000);
  }, [dateTo]);

  const query: TransactionQuery = useMemo(
    () => ({
      tenantId,
      page,
      pageSize: clampedPageSize,
      cardId: cardIdFilter.trim() || undefined,
      type: typeFilter || undefined,
      dateFrom: dateFromTimestamp,
      dateTo: dateToTimestamp,
    }),
    [tenantId, page, clampedPageSize, cardIdFilter, typeFilter, dateFromTimestamp, dateToTimestamp],
  );

  const { data, isLoading } = useQuery({
    queryKey: [
      "transactions",
      tenantId,
      page,
      clampedPageSize,
      cardIdFilter,
      typeFilter,
      dateFrom,
      dateTo,
    ],
    queryFn: async () => {
      const localAccountStore = await getLocalAccountStore();
      const [transactions, accounts] = await Promise.all([
        getTransactions(query),
        localAccountStore.getByTenant(tenantId),
      ]);
      const operatorName =
        accounts.find((account) => account.accountId === accountId)?.username ?? null;

      return {
        ...transactions,
        entries: transactions.entries.map((entry) => ({
          ...entry,
          operatorName,
        })),
      };
    },
  });

  const totalPages = data ? Math.ceil(data.total / data.pageSize) : 0;

  const handleCardIdChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    setCardIdFilter(e.target.value);
    setPage(1);
  }, []);

  const handleTypeChange = useCallback((value: string) => {
    setTypeFilter(value === "all" ? "" : (value as TransactionLog["type"]));
    setPage(1);
  }, []);

  const handleDateFromChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    setDateFrom(e.target.value);
    setPage(1);
  }, []);

  const handleDateToChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    setDateTo(e.target.value);
    setPage(1);
  }, []);

  const hasActiveFilters =
    cardIdFilter.trim() !== "" || typeFilter !== "" || dateFrom !== todayStr || dateTo !== todayStr;

  const handleClearFilters = useCallback(() => {
    setCardIdFilter("");
    setTypeFilter("");
    setDateFrom(todayStr);
    setDateTo(todayStr);
    setPage(1);
  }, [todayStr]);

  return (
    <DataTable
      columns={columns}
      data={data?.entries ?? []}
      isLoading={isLoading}
      paginationMode="server"
      serverPagination={{
        pageIndex: page - 1,
        pageSize: clampedPageSize,
        totalItems: data?.total ?? 0,
        totalPages,
      }}
      onPaginationChange={(updater) => {
        const current = { pageIndex: page - 1, pageSize: clampedPageSize };
        const next = typeof updater === "function" ? updater(current) : updater;
        setPage(next.pageIndex + 1);
      }}
      showSearch={false}
      enableSorting={false}
      getRowId={(row) => (row.id == null ? `${row.cardId}-${row.counter}` : String(row.id))}
      header={
        <div className="flex flex-wrap items-end gap-2 rounded-xl border border-border bg-muted/30 p-3">
          <div className="flex flex-col gap-1">
            <Label htmlFor="filter-card-id" className="text-xs text-muted-foreground">
              Card ID
            </Label>
            <Input
              id="filter-card-id"
              type="text"
              placeholder="Cari card ID..."
              value={cardIdFilter}
              onChange={handleCardIdChange}
              className="h-8 w-36 font-mono text-xs bg-white"
            />
          </div>

          <div className="flex flex-col gap-1">
            <Label htmlFor="filter-type" className="text-xs text-muted-foreground">
              Tipe
            </Label>
            <Select value={typeFilter || "all"} onValueChange={handleTypeChange}>
              <SelectTrigger id="filter-type" size="sm" className="w-36 bg-white">
                <SelectValue placeholder="Semua tipe" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Semua</SelectItem>
                {TYPE_FILTER_OPTIONS.map((opt) => (
                  <SelectItem key={opt.value} value={opt.value}>
                    {opt.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="flex flex-col gap-1">
            <Label htmlFor="filter-date-from" className="text-xs text-muted-foreground">
              Dari
            </Label>
            <Input
              id="filter-date-from"
              type="date"
              value={dateFrom}
              onChange={handleDateFromChange}
              className="h-8 w-36 text-xs bg-white"
            />
          </div>

          <div className="flex flex-col gap-1">
            <Label htmlFor="filter-date-to" className="text-xs text-muted-foreground">
              Sampai
            </Label>
            <Input
              id="filter-date-to"
              type="date"
              value={dateTo}
              onChange={handleDateToChange}
              className="h-8 w-36 text-xs bg-white"
            />
          </div>

          {hasActiveFilters && (
            <Button
              variant="ghost"
              size="sm"
              onClick={handleClearFilters}
              className="h-8 gap-1 text-xs text-muted-foreground self-end"
            >
              <X size={13} />
              Reset
            </Button>
          )}
        </div>
      }
      emptyState={
        <div className="flex flex-col items-center justify-center py-12 text-center">
          <Receipt size={36} className="text-muted-foreground/30 mb-3" />
          <p className="text-sm text-muted-foreground">Tidak ada transaksi ditemukan.</p>
        </div>
      }
      emptySearchState={
        <div className="flex flex-col items-center justify-center py-12 text-center">
          <p className="text-sm text-muted-foreground">
            Tidak ada transaksi yang cocok dengan filter.
          </p>
          <Button variant="link" size="sm" onClick={handleClearFilters} className="mt-1 text-sm">
            Reset semua filter
          </Button>
        </div>
      }
      renderMobileItem={(row) => {
        const tx = row.original;
        const isCredit = CREDIT_TYPES.has(tx.type);
        const isDebit = DEBIT_TYPES.has(tx.type);
        return (
          <div className="px-4 py-3 bg-white">
            {/* Row 1: icon + type label + amount */}
            <div className="flex items-center gap-3">
              <div
                className={cn(
                  "size-9 rounded-xl flex items-center justify-center shrink-0",
                  isCredit && "bg-emerald-50",
                  isDebit && "bg-red-50",
                  !isCredit && !isDebit && "bg-muted",
                )}
              >
                <TypeIcon type={tx.type} />
              </div>
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-1.5">
                  <span className="text-sm font-medium">{TYPE_LABELS[tx.type] ?? tx.type}</span>
                  <SyncIcon status={tx.syncStatus} />
                </div>
                <p className="text-xs text-muted-foreground">{formatDateTime(tx.timestamp)}</p>
              </div>
              <span
                className={cn("text-sm font-semibold font-mono shrink-0", amountColor(tx.type))}
              >
                {amountPrefix(tx.type)}Rp {formatAmount(tx.amount)}
              </span>
            </div>
            {/* Row 2: card name/ID + balance after */}
            <div className="flex items-center justify-between mt-2 pl-12">
              <div className="min-w-0 flex-1">
                {tx.cardName && (
                  <span className="text-xs font-medium truncate block">{tx.cardName}</span>
                )}
                <span className="text-xs text-muted-foreground font-mono truncate block">
                  {tx.cardId}
                </span>
              </div>
              <span className="text-xs font-medium text-emerald-600 shrink-0">
                Saldo: Rp {formatAmount(tx.balanceAfter)}
              </span>
            </div>
          </div>
        );
      }}
    />
  );
}
