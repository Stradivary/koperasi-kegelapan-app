// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { renderHook, act } from "@testing-library/react";

vi.mock("#/lib/api", () => ({
  API_BASE_URL: "https://api.test",
}));

const mockFetch = vi.fn();
globalThis.fetch = mockFetch;

beforeEach(() => {
  vi.clearAllMocks();
  vi.useFakeTimers();
});

afterEach(() => {
  vi.useRealTimers();
});

describe("useServerTenantSearch", () => {
  it("starts with empty query, results, and no loading", async () => {
    const { useServerTenantSearch } = await import("../useServerTenantSearch");
    const { result } = renderHook(() => useServerTenantSearch());
    expect(result.current.query).toBe("");
    expect(result.current.results).toEqual([]);
    expect(result.current.loading).toBe(false);
    expect(result.current.error).toBeNull();
  });

  it("does not fetch when query is less than 2 chars", async () => {
    const { useServerTenantSearch } = await import("../useServerTenantSearch");
    const { result } = renderHook(() => useServerTenantSearch());

    act(() => {
      result.current.setQuery("k");
    });

    await act(async () => {
      vi.advanceTimersByTime(400);
    });

    expect(mockFetch).not.toHaveBeenCalled();
    expect(result.current.results).toEqual([]);
  });

  it("fetches when query is >= 2 chars after debounce", async () => {
    mockFetch.mockResolvedValue({
      ok: true,
      json: () =>
        Promise.resolve({ tenants: [{ tenantId: "t-1", name: "Koperasi A", slug: "koperasi-a" }] }),
    });

    const { useServerTenantSearch } = await import("../useServerTenantSearch");
    const { result } = renderHook(() => useServerTenantSearch());

    act(() => {
      result.current.setQuery("ko");
    });

    await act(async () => {
      vi.advanceTimersByTime(300);
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(mockFetch).toHaveBeenCalledWith(expect.stringContaining("q=ko"));
  });

  it("sets results after successful fetch", async () => {
    const tenants = [{ tenantId: "t-1", name: "Koperasi A", slug: "koperasi-a" }];
    mockFetch.mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ tenants }),
    });

    const { useServerTenantSearch } = await import("../useServerTenantSearch");
    const { result } = renderHook(() => useServerTenantSearch());

    act(() => {
      result.current.setQuery("ko");
    });

    await act(async () => {
      vi.advanceTimersByTime(300);
      await Promise.resolve();
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(result.current.results).toEqual(tenants);
    expect(result.current.error).toBeNull();
  });

  it("sets error when fetch fails", async () => {
    mockFetch.mockRejectedValue(new Error("Network error"));

    const { useServerTenantSearch } = await import("../useServerTenantSearch");
    const { result } = renderHook(() => useServerTenantSearch());

    act(() => {
      result.current.setQuery("ko");
    });

    await act(async () => {
      vi.advanceTimersByTime(300);
      await Promise.resolve();
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(result.current.error).toBe("Network error");
    expect(result.current.results).toEqual([]);
  });

  it("sets error when response is not ok", async () => {
    mockFetch.mockResolvedValue({
      ok: false,
      status: 500,
    });

    const { useServerTenantSearch } = await import("../useServerTenantSearch");
    const { result } = renderHook(() => useServerTenantSearch());

    act(() => {
      result.current.setQuery("ko");
    });

    await act(async () => {
      vi.advanceTimersByTime(300);
      await Promise.resolve();
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(result.current.error).toContain("500");
  });

  it("clears results when query drops below 2 chars", async () => {
    mockFetch.mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ tenants: [{ tenantId: "t-1", name: "A", slug: "a" }] }),
    });

    const { useServerTenantSearch } = await import("../useServerTenantSearch");
    const { result } = renderHook(() => useServerTenantSearch());

    act(() => {
      result.current.setQuery("ko");
    });

    await act(async () => {
      vi.advanceTimersByTime(300);
      await Promise.resolve();
      await Promise.resolve();
      await Promise.resolve();
    });

    act(() => {
      result.current.setQuery("k");
    });

    expect(result.current.results).toEqual([]);
  });

  it("uses cache for repeated queries", async () => {
    const tenants = [{ tenantId: "t-1", name: "Koperasi A", slug: "koperasi-a" }];
    mockFetch.mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ tenants }),
    });

    const { useServerTenantSearch } = await import("../useServerTenantSearch");
    const { result } = renderHook(() => useServerTenantSearch());

    // First query
    act(() => {
      result.current.setQuery("ko");
    });
    await act(async () => {
      vi.advanceTimersByTime(300);
      await Promise.resolve();
      await Promise.resolve();
      await Promise.resolve();
    });

    const callCount = mockFetch.mock.calls.length;

    // Same query again — should use cache
    act(() => {
      result.current.setQuery("");
    });
    act(() => {
      result.current.setQuery("ko");
    });
    await act(async () => {
      vi.advanceTimersByTime(300);
      await Promise.resolve();
    });

    expect(mockFetch.mock.calls.length).toBe(callCount); // no new fetch
  });
});
