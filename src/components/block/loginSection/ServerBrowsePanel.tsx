import { ArrowLeft, Search, WifiOff } from "lucide-react";
import type { TenantSearchResult } from "#/hooks/useServerTenantSearch";
import { AuthLayout } from "../../layout/AuthLayout";
import { LoadingState } from "../LoadingState";
import { Button } from "../../ui/button";
import { Input } from "../../ui/input";

interface ServerBrowsePanelProps {
  query: string;
  results: TenantSearchResult[];
  loading: boolean;
  error: string | null;
  isOnline: boolean;
  onQueryChange: (value: string) => void;
  onSelect: (tenant: TenantSearchResult) => void;
  onBack: () => void;
}

export function ServerBrowsePanel({
  query,
  results,
  loading,
  error,
  isOnline,
  onQueryChange,
  onSelect,
  onBack,
}: ServerBrowsePanelProps) {
  const showNoResults = !loading && query.length >= 2 && results.length === 0 && !error && isOnline;

  return (
    <AuthLayout variant="brand-dark" headerSubtitle="Cari Koperasi">
      <div>
        <h1 className="type-h5 text-foreground">Cari Koperasi</h1>
        <p className="type-body2 text-signal-text-secondary mt-0.5">
          Temukan koperasi yang terdaftar di server
        </p>
      </div>

      {!isOnline && (
        <div
          className="flex items-center gap-2 rounded-lg bg-yellow-50 border border-yellow-200 px-3 py-2"
          role="status"
          aria-live="polite"
        >
          <WifiOff size={16} className="text-yellow-600 shrink-0" />
          <p className="type-body2 text-yellow-700">
            Kamu sedang offline. Pencarian membutuhkan koneksi internet.
          </p>
        </div>
      )}

      <div className="relative">
        <Search
          size={16}
          className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground"
        />
        <Input
          type="text"
          placeholder={isOnline ? "Cari koperasi..." : "Offline - tidak bisa mencari"}
          value={query}
          onChange={(event) => onQueryChange(event.target.value)}
          disabled={!isOnline}
          className="h-11 pl-9"
        />
      </div>

      {loading && isOnline && <LoadingState variant="section" text="Mencari..." />}

      {error && (
        <div className="rounded-lg bg-signal-bg-error border border-signal-error/30 px-3 py-2">
          <p className="type-body2 text-signal-error">{error}</p>
        </div>
      )}

      {showNoResults && (
        <div className="py-6 text-center">
          <p className="type-body2 text-muted-foreground">Tidak ada koperasi yang cocok</p>
        </div>
      )}

      {results.length > 0 && (
        <div className="space-y-2">
          {results.map((tenant) => (
            <button
              key={tenant.tenantId}
              type="button"
              onClick={() => onSelect(tenant)}
              className="w-full flex items-center gap-3 rounded-xl px-4 py-3 border border-border hover:bg-accent active:scale-[0.98] transition-all text-left"
            >
              <div className="flex-1 min-w-0">
                <p className="type-body1-bold text-foreground truncate">{tenant.name}</p>
                <p className="type-body2 text-muted-foreground truncate">{tenant.slug}</p>
              </div>
            </button>
          ))}
        </div>
      )}

      <Button type="button" variant="outline" onClick={onBack} className="w-full">
        <ArrowLeft size={15} className="mr-1.5" />
        Kembali
      </Button>
    </AuthLayout>
  );
}
