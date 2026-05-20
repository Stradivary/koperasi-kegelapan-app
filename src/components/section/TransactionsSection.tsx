import { useState, useMemo, useCallback } from "react";
import { useQuery } from "@tanstack/react-query";
import { getTransactions, type TransactionQuery } from "../../lib/transactionLogService";
import type { TransactionLog } from "../../db/local-db";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "../ui/table";
import { Badge } from "../ui/badge";
import { Button } from "../ui/button";
import { Input } from "../ui/input";
import { Label } from "../ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "../ui/select";
import { ChevronLeft, ChevronRight, X } from "lucide-react";

interface TransactionsSectionProps {
  tenantId: string;
}

const PAGE_SIZE_DEFAULT = 20;
const PAGE_SIZE_MAX = 100;

const TYPE_LABELS: Record<TransactionLog["type"], string> = {
  debit: "Debit",
  credit: "Kredit",
  checkin: "Check-in",
  checkout: "Check-out",
  topup: "Top-up",
  admin: "Admin",
};

/** Filter dropdown options mapping display labels to DB type values */
const TYPE_FILTER_OPTIONS: { label: string; value: TransactionLog["type"] }[] = [
  { label: "Debit", value: "debit" },
  { label: "Kredit / Top-up", value: "credit" },
  { label: "Top-up", value: "topup" },
  { label: "Check-in", value: "checkin" },
  { label: "Check-out", value: "checkout" },
  { label: "Admin", value: "admin" },
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

export function TransactionsSection({ tenantId }: TransactionsSectionProps) {
  const [page, setPage] = useState(1);
  const [pageSize] = useState(PAGE_SIZE_DEFAULT);

  // Filter state
  const [cardIdFilter, setCardIdFilter] = useState("");
  const [typeFilter, setTypeFilter] = useState<TransactionLog["type"] | "">("");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");

  const clampedPageSize = useMemo(() => Math.min(Math.max(1, pageSize), PAGE_SIZE_MAX), [pageSize]);

  // Convert date strings to unix timestamps (seconds) for the query
  const dateFromTimestamp = useMemo(() => {
    if (!dateFrom) return undefined;
    const d = new Date(dateFrom);
    if (isNaN(d.getTime())) return undefined;
    // Start of day (inclusive)
    d.setHours(0, 0, 0, 0);
    return Math.floor(d.getTime() / 1000);
  }, [dateFrom]);

  const dateToTimestamp = useMemo(() => {
    if (!dateTo) return undefined;
    const d = new Date(dateTo);
    if (isNaN(d.getTime())) return undefined;
    // End of day (inclusive)
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

  // Reset page to 1 when any filter changes
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
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="type-title-bold text-foreground">Transaksi</h2>
        {data && <p className="type-body2 text-muted-foreground">{data.total} transaksi</p>}
      </div>

      {/* Filter controls */}
      <div className="flex flex-wrap items-end gap-3 rounded-md border border-border bg-muted/30 p-3">
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
            className="h-8 w-36 font-mono text-xs"
          />
        </div>

        <div className="flex flex-col gap-1.5">
          <Label htmlFor="filter-type" className="text-xs text-muted-foreground">
            Tipe
          </Label>
          <Select value={typeFilter || "all"} onValueChange={handleTypeChange}>
            <SelectTrigger id="filter-type" size="sm" className="w-36">
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
            className="h-8 w-36 text-xs"
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
            className="h-8 w-36 text-xs"
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

      {isLoading && (
        <div className="flex items-center justify-center py-12">
          <p className="type-body1 text-muted-foreground">Memuat transaksi...</p>
        </div>
      )}

      {!isLoading && data && data.entries.length === 0 && (
        <div className="flex flex-col items-center justify-center py-12 text-center">
          <p className="type-body1 text-muted-foreground">
            {hasActiveFilters
              ? "Tidak ada transaksi yang cocok dengan filter yang diterapkan."
              : "Tidak ada transaksi ditemukan."}
          </p>
          {hasActiveFilters && (
            <Button variant="link" size="sm" onClick={handleClearFilters} className="mt-2 text-sm">
              Reset semua filter
            </Button>
          )}
        </div>
      )}

      {!isLoading && data && data.entries.length > 0 && (
        <>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Waktu</TableHead>
                <TableHead>Card ID</TableHead>
                <TableHead>Tipe</TableHead>
                <TableHead className="text-right">Jumlah</TableHead>
                <TableHead className="text-right">Saldo</TableHead>
                <TableHead>Status Sync</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {data.entries.map((tx) => (
                <TableRow key={tx.id ?? `${tx.cardId}-${tx.counter}`}>
                  <TableCell className="type-body2">{formatDateTime(tx.timestamp)}</TableCell>
                  <TableCell className="font-mono type-body2">{tx.cardId}</TableCell>
                  <TableCell>
                    <Badge variant="outline">{TYPE_LABELS[tx.type] ?? tx.type}</Badge>
                  </TableCell>
                  <TableCell className="text-right font-mono type-body2">
                    {formatAmount(tx.amount)}
                  </TableCell>
                  <TableCell className="text-right font-mono type-body2">
                    {formatAmount(tx.balanceAfter)}
                  </TableCell>
                  <TableCell>
                    <Badge variant={SYNC_STATUS_VARIANT[tx.syncStatus]}>
                      {SYNC_STATUS_LABELS[tx.syncStatus]}
                    </Badge>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>

          {/* Pagination controls */}
          <div className="flex items-center justify-between pt-2">
            <p className="type-body2 text-muted-foreground">
              Halaman {page} dari {totalPages}
            </p>
            <div className="flex items-center gap-2">
              <Button
                variant="outline"
                size="icon-sm"
                disabled={page <= 1}
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                aria-label="Halaman sebelumnya"
              >
                <ChevronLeft size={16} />
              </Button>
              <Button
                variant="outline"
                size="icon-sm"
                disabled={page >= totalPages}
                onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                aria-label="Halaman berikutnya"
              >
                <ChevronRight size={16} />
              </Button>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
