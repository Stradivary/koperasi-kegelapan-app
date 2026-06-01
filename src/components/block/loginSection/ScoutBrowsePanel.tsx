import { ArrowLeft, BookOpen, Search, WifiOff } from "lucide-react";
import type { TenantSearchResult } from "#/hooks/useServerTenantSearch";
import type { LocalTenantConfig } from "#/hooks/types";
import { AuthLayout } from "../../layout/AuthLayout";
import { LoadingState } from "../LoadingState";
import { Button } from "../../ui/button";
import { Input } from "../../ui/input";

interface ScoutBrowsePanelProps {
  query: string;
  results: TenantSearchResult[];
  loading: boolean;
  error: string | null;
  slugError: string | null;
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
  slugError,
  isOnline,
  localTenants,
  onQueryChange,
  onSelectServer,
  onSelectLocal,
  onEnterSlug,
  onBack,
}: Readonly<ScoutBrowsePanelProps>) {
  // Offline: filter local tenants by query
  const filteredLocal =
    !isOnline && query.length > 0
      ? localTenants.filter(
          (t) =>
            t.name.toLowerCase().includes(query.toLowerCase()) ||
            t.slug.toLowerCase().includes(query.toLowerCase()),
        )
      : localTenants;

  const showNoResults = !loading && query.length >= 2 && results.length === 0 && !error && isOnline;

  const showOfflineEmpty = !isOnline && query.length >= 2 && filteredLocal.length === 0;

  function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const slug = query.trim().toLowerCase();
    if (slug.length > 0) onEnterSlug(slug);
  }

  return (
    <AuthLayout variant="brand-dark" headerSubtitle="Buka Scout">
      <div>
        <h1 className="type-h5 text-foreground">Buka Scout</h1>
        <p className="type-body2 text-signal-text-secondary mt-0.5">
          Cari koperasi untuk membuka halaman Scout (tanpa password)
        </p>
      </div>

      {/* Single search / slug entry */}
      <form onSubmit={handleSubmit} className="space-y-2">
        <div className="relative flex gap-2">
          <div className="relative flex-1">
            <Search
              size={16}
              className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground"
            />
            <Input
              id="scout-search"
              type="text"
              placeholder={isOnline ? "Cari atau ketik slug koperasi..." : "Cari koperasi lokal..."}
              value={query}
              onChange={(e) =>
                onQueryChange(e.target.value.toLowerCase().replaceAll(/[^a-z0-9-]/g, ""))
              }
              className="h-11 pl-9"
              autoComplete="off"
            />
          </div>
          {/* Show Buka button only when query looks like an exact slug (no spaces, has content) */}
          {query.trim().length > 0 && (
            <Button type="submit" className="h-11 shrink-0">
              Buka
            </Button>
          )}
        </div>
      </form>

      {/* Slug resolution error */}
      {slugError && (
        <div
          className="flex items-center gap-2 rounded-lg bg-signal-bg-error border border-signal-error/30 px-3 py-2"
          role="alert"
        >
          <WifiOff size={16} className="text-signal-error shrink-0" />
          <p className="type-body2 text-signal-error">
            Koperasi &ldquo;{slugError}&rdquo; tidak ditemukan.{" "}
            {!isOnline && "Sambungkan ke internet atau pilih dari daftar lokal."}
          </p>
        </div>
      )}

      {/* Offline notice */}
      {!isOnline && localTenants.length === 0 && (
        <div
          className="flex items-center gap-2 rounded-lg bg-yellow-50 border border-yellow-200 px-3 py-2"
          role="status"
          aria-live="polite"
        >
          <WifiOff size={16} className="text-yellow-600 shrink-0" />
          <p className="type-body2 text-yellow-700">
            Kamu sedang offline dan tidak ada koperasi lokal tersimpan.
          </p>
        </div>
      )}

      {/* Online: server search results */}
      {isOnline && (
        <>
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

      {/* Offline: local tenants (filtered by query if any) */}
      {!isOnline && filteredLocal.length > 0 && (
        <div className="space-y-2">
          <p className="type-body2 text-muted-foreground">Koperasi Lokal</p>
          {filteredLocal.map((tenant) => (
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

      {/* Offline: local tenants shown unfiltered when no query */}
      {!isOnline && query.length === 0 && localTenants.length > 0 && (
        <div className="space-y-2">
          <p className="type-body2 text-muted-foreground">Koperasi Lokal</p>
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

      {showOfflineEmpty && (
        <div className="py-6 text-center">
          <p className="type-body2 text-muted-foreground">Tidak ada koperasi lokal yang cocok</p>
        </div>
      )}

      <Button type="button" variant="outline" onClick={onBack} className="w-full">
        <ArrowLeft size={15} className="mr-1.5" />
        Kembali
      </Button>
    </AuthLayout>
  );
}
