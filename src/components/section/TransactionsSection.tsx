import { useState, useMemo, useCallback } from "react";
import { useQuery } from "@tanstack/react-query";
import { createColumnHelper } from "@tanstack/react-table";
import { getTransactions, type TransactionQuery } from "../../lib/transactionLogService";
import type { TransactionLog } from "../../db/local-db";
import { Badge } from "../ui/badge";
import { Button } from "../ui/button";
import { Input } from "../ui/input";
import { Label } from "../ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "../ui/select";
import { X } from "lucide-react";
import { DataTable } from "../block/data-table";

interface TransactionsSectionProps {
  tenantId: string;
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
  // { label: "Debit", value: "debit" },
  // { label: "Kredit / Top-up", value: "credit" },
  { label: "Top-up", value: "topup" },
  { label: "Check-in", value: "checkin" },
  { label: "Check-out", value: "checkout" },
  // { label: "Admin", value: "admin" },
];

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

const columnHelper = createColumnHelper<TransactionLog>();

const columns = [
  columnHelper.accessor("timestamp", {
    header: "Waktu",
    cell: (info) => <span className="text-xs">{formatDateTime(info.getValue())}</span>,
  }),
  columnHelper.accessor("cardId", {
    header: "Card ID",
    cell: (info) => <span className="font-mono text-xs">{info.getValue()}</span>,
  }),
  columnHelper.accessor("type", {
    header: "Tipe",
    cell: (info) => (
      <Badge variant="outline">{TYPE_LABELS[info.getValue()] ?? info.getValue()}</Badge>
    ),
  }),
  columnHelper.accessor("amount", {
    header: () => <span className="text-right w-full block">Jumlah</span>,
    cell: (info) => (
      <span className="text-right block font-mono text-xs">{formatAmount(info.getValue())}</span>
    ),
  }),
  columnHelper.accessor("balanceAfter", {
    header: () => <span className="text-right w-full block">Saldo</span>,
    cell: (info) => (
      <span className="text-right block font-mono text-xs">{formatAmount(info.getValue())}</span>
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

export function TransactionsSection({ tenantId }: TransactionsSectionProps) {
  const [page, setPage] = useState(1);
  const [pageSize] = useState(PAGE_SIZE_DEFAULT);

  // Filter state
  const [cardIdFilter, setCardIdFilter] = useState("");
  const [typeFilter, setTypeFilter] = useState<TransactionLog["type"] | "">("");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");

  const clampedPageSize = useMemo(() => Math.min(Math.max(1, pageSize), PAGE_SIZE_MAX), [pageSize]);

  const dateFromTimestamp = useMemo(() => {
    if (!dateFrom) return undefined;
    const d = new Date(dateFrom);
    if (isNaN(d.getTime())) return undefined;
    d.setHours(0, 0, 0, 0);
    return Math.floor(d.getTime() / 1000);
  }, [dateFrom]);

  const dateToTimestamp = useMemo(() => {
    if (!dateTo) return undefined;
    const d = new Date(dateTo);
    if (isNaN(d.getTime())) return undefined;
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
    queryFn: () => getTransactions(query),
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
    cardIdFilter.trim() !== "" || typeFilter !== "" || dateFrom !== "" || dateTo !== "";

  const handleClearFilters = useCallback(() => {
    setCardIdFilter("");
    setTypeFilter("");
    setDateFrom("");
    setDateTo("");
    setPage(1);
  }, []);

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
      getRowId={(row) => (row.id != null ? String(row.id) : `${row.cardId}-${row.counter}`)}
      header={
        <div className="space-y-4">
          {/* Filter controls */}
          <div className="flex flex-wrap items-end gap-3 rounded-md bg-white border border-border bg-muted/30 p-3">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="filter-card-id" className="text-xs text-muted-foreground">
                Card ID
              </Label>
              <Input
                id="filter-card-id"
                type="text"
                placeholder="Cari card ID..."
                value={cardIdFilter}
                onChange={handleCardIdChange}
                className="h-8 w-38 font-mono text-xs"
              />
            </div>

            <div className="flex flex-col gap-1.5">
              <Label htmlFor="filter-type" className="text-xs text-muted-foreground">
                Tipe
              </Label>
              <Select value={typeFilter || "all"} onValueChange={handleTypeChange}>
                <SelectTrigger id="filter-type" size="sm" className="w-38">
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

            <div className="flex flex-col gap-1.5">
              <Label htmlFor="filter-date-from" className="text-xs text-muted-foreground">
                Dari tanggal
              </Label>
              <Input
                id="filter-date-from"
                type="date"
                value={dateFrom}
                onChange={handleDateFromChange}
                className="h-8 w-38 text-xs"
              />
            </div>

            <div className="flex flex-col gap-1.5">
              <Label htmlFor="filter-date-to" className="text-xs text-muted-foreground">
                Sampai tanggal
              </Label>
              <Input
                id="filter-date-to"
                type="date"
                value={dateTo}
                onChange={handleDateToChange}
                className="h-8 w-38 text-xs"
              />
            </div>

            {hasActiveFilters && (
              <Button
                variant="ghost"
                size="sm"
                onClick={handleClearFilters}
                className="h-8 gap-1 text-xs text-muted-foreground"
              >
                <X size={14} />
                Reset
              </Button>
            )}
          </div>
        </div>
      }
      emptyState={
        <div className="flex flex-col items-center justify-center py-12 text-center">
          <p className="text-sm text-muted-foreground">Tidak ada transaksi ditemukan.</p>
        </div>
      }
      emptySearchState={
        <div className="flex flex-col items-center justify-center py-12 text-center">
          <p className="text-sm text-muted-foreground">
            Tidak ada transaksi yang cocok dengan filter yang diterapkan.
          </p>
          <Button variant="link" size="sm" onClick={handleClearFilters} className="mt-2 text-sm">
            Reset semua filter
          </Button>
        </div>
      }
      renderMobileItem={(row) => {
        const tx = row.original;
        return (
          <div className="px-4 py-3 space-y-1">
            <div className="flex items-center justify-between gap-2">
              <Badge variant="outline">{TYPE_LABELS[tx.type] ?? tx.type}</Badge>
              <span className="font-mono text-sm font-medium">Rp {formatAmount(tx.amount)}</span>
            </div>
            <div className="flex items-center justify-between gap-2 text-xs text-muted-foreground">
              <span className="font-mono">{tx.cardId}</span>
              <Badge variant={SYNC_STATUS_VARIANT[tx.syncStatus]} className="text-[10px]">
                {SYNC_STATUS_LABELS[tx.syncStatus]}
              </Badge>
            </div>
            <p className="text-xs text-muted-foreground">{formatDateTime(tx.timestamp)}</p>
            <p className="text-xs text-muted-foreground">
              Saldo: Rp {formatAmount(tx.balanceAfter)}
            </p>
          </div>
        );
      }}
    />
  );
}
