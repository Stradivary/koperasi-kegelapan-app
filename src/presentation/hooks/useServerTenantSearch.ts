import { useEffect, useRef, useState } from "react";
import { API_BASE_URL } from "#/infrastructure/api/apiClient";
export interface TenantSearchResult {
  tenantId: string;
  slug: string;
  name: string;
}

export interface UseServerTenantSearchReturn {
  query: string;
  setQuery: (q: string) => void;
  results: TenantSearchResult[];
  loading: boolean;
  error: string | null;
}

export function useServerTenantSearch(): UseServerTenantSearchReturn {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<TenantSearchResult[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const cacheRef = useRef<Map<string, TenantSearchResult[]>>(new Map());
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (query.length < 2) {
      setResults([]);
      setLoading(false);
      return;
    }

    const cached = cacheRef.current.get(query);
    if (cached) {
      setResults(cached);
      setLoading(false);
      return;
    }

    setLoading(true);

    if (debounceRef.current) clearTimeout(debounceRef.current);

    debounceRef.current = setTimeout(async () => {
      try {
        const res = await fetch(
          `${API_BASE_URL}/api/tenants/search?q=${encodeURIComponent(query)}&limit=10`,
        );
        if (!res.ok) throw new Error(`Search failed: ${res.status}`);
        const data = await res.json();
        cacheRef.current.set(query, data.tenants);
        setResults(data.tenants);
        setError(null);
      } catch (e) {
        setError(e instanceof Error ? e.message : "Tidak dapat terhubung ke server");
        setResults([]);
      } finally {
        setLoading(false);
      }
    }, 300);

    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [query]);

  return { query, setQuery, results, loading, error };
}
