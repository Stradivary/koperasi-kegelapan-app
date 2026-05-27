import { useState } from "react";
import { ArrowLeft, BookOpen, Search, WifiOff } from "lucide-react";
import type { TenantSearchResult } from "#/hooks/useServerTenantSearch";
import type { LocalTenantConfig } from "#/lib/indexeddb";
import { AuthLayout } from "../../layout/AuthLayout";
import { LoadingState } from "../LoadingState";
import { Button } from "../../ui/button";
import { Input } from "../../ui/input";
import { Label } from "../../ui/label";

interface ScoutBrowsePanelProps {
  query: string;
  results: TenantSearchResult[];
  loading: boolean;
  error: string | null;
  isOnline: boolean;
  localTenants: LocalTenantConfig[];
  onQueryChange: (value: string) => void;
  onSelectServer: (tenant: TenantSearchResult) => void;
  onSelectLocal: (tenant: LocalTenantConfig) => void;
  onEnterSlug: (slug: string) => void;
  onBack: () => void;
}

export function ScoutBrowsePanel({
  query,
  results,
  loading,
  error,
  isOnline,
  localTenants,
  onQueryChange,
  onSelectServer,
  onSelectLocal,
  onEnterSlug,
  onBack,
}: Readonly<ScoutBrowsePanelProps>) {
  const [manualSlug, setManualSlug] = useState("");

  const showNoResults = !loading && query.length >= 2 && results.length === 0 && !error && isOnline;

  function handleManualSlugSubmit(e: React.SubmitEvent<HTMLFormElement>) {
    e.preventDefault();
    const slug = manualSlug.trim().toLowerCase();
    if (slug.length > 0) {
      onEnterSlug(slug);
    }
  }

  return (
    <AuthLayout variant="brand-dark" headerSubtitle="Buka Scout">
      <div>
        <h1 className="type-h5 text-foreground">Buka Scout</h1>
        <p className="type-body2 text-signal-text-secondary mt-0.5">
          Pilih koperasi untuk membuka halaman Scout (tanpa password)
        </p>
      </div>

      {/* Manual slug entry */}
      <form onSubmit={handleManualSlugSubmit} className="space-y-2">
        <Label htmlFor="scout-slug" className="type-body2 text-muted-foreground">
          Masukkan slug koperasi langsung
        </Label>
        <div className="flex gap-2">
          <Input
            id="scout-slug"
            type="text"
            placeholder="slug-koperasi"
            value={manualSlug}
            onChange={(e) =>
              setManualSlug(e.target.value.toLowerCase().replaceAll(/[^a-z0-9-]/g, ""))
            }
            className="h-11 flex-1"
          />
          <Button type="submit" disabled={manualSlug.trim().length === 0} className="h-11 shrink-0">
            Buka
          </Button>
        </div>
      </form>

      {!isOnline && localTenants.length === 0 && (
        <div
          className="flex items-center gap-2 rounded-lg bg-yellow-50 border border-yellow-200 px-3 py-2"
          role="status"
          aria-live="polite"
        >
          <WifiOff size={16} className="text-yellow-600 shrink-0" />
          <p className="type-body2 text-yellow-700">
            Kamu sedang offline. Gunakan slug di atas atau pilih koperasi lokal.
          </p>
        </div>
      )}

      {/* Local tenants section */}
      {localTenants.length > 0 && (
        <div className="space-y-2">
          <p className="type-body2 text-muted-foreground">Koperasi Lokal / Terdaftar</p>
          {localTenants.map((tenant) => (
            <button
              key={tenant.tenantId}
              type="button"
              onClick={() => onSelectLocal(tenant)}
              className="w-full flex items-center gap-3 rounded-xl px-4 py-3 border border-border hover:bg-accent active:scale-[0.98] transition-all text-left"
            >
              <div className="size-10 rounded-lg bg-muted flex items-center justify-center shrink-0">
                <BookOpen size={18} className="text-muted-foreground" />
              </div>
              <div className="flex-1 min-w-0">
                <p className="type-body1-bold text-foreground truncate">{tenant.name}</p>
                <p className="type-body2 text-muted-foreground truncate">{tenant.slug}</p>
              </div>
            </button>
          ))}
        </div>
      )}

      {/* Server search section */}
      {isOnline && (
        <>
          <div className="space-y-2">
            <p className="type-body2 text-muted-foreground">Cari Koperasi di Server</p>
            <div className="relative">
              <Search
                size={16}
                className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground"
              />
              <Input
                type="text"
                placeholder="Cari koperasi..."
                value={query}
                onChange={(event) => onQueryChange(event.target.value)}
                className="h-11 pl-9"
              />
            </div>
          </div>

          {loading && <LoadingState variant="section" text="Mencari..." />}

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
                  onClick={() => onSelectServer(tenant)}
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
        </>
      )}

      <Button type="button" variant="outline" onClick={onBack} className="w-full">
        <ArrowLeft size={15} className="mr-1.5" />
        Kembali
      </Button>
    </AuthLayout>
  );
}
