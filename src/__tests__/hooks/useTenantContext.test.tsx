// @vitest-environment jsdom
/**
 * Tests for src/hooks/useTenantContext.tsx
 */
import { render, screen, renderHook, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mockNavigate = vi.fn();
const mockTenantContextStoreGet = vi.fn();
const mockTenantContextStoreDelete = vi.fn();
const mockGetDeviceFingerprint = vi.fn();
const mockRestoreAuthState = vi.fn();

vi.mock("@tanstack/react-router", () => ({
  useNavigate: () => mockNavigate,
}));

vi.mock("#/lib/indexeddb.lazy", () => ({
  getTenantContextStore: () =>
    Promise.resolve({
      get: mockTenantContextStoreGet,
      delete: mockTenantContextStoreDelete,
    }),
}));

vi.mock("#/lib/getOrCreateDeviceId", () => ({
  getDeviceFingerprint: () => mockGetDeviceFingerprint(),
}));

vi.mock("#/lib/api", () => ({
  restoreAuthState: (deviceId: string) => mockRestoreAuthState(deviceId),
}));

vi.mock("#/components/block/LoadingState", () => ({
  LoadingState: ({ variant }: { variant: string }) => (
    <div data-testid="loading-state" data-variant={variant} />
  ),
}));

import { useTenantContext, TenantRoutePending } from "#/hooks/useTenantContext";

describe("useTenantContext", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGetDeviceFingerprint.mockResolvedValue("device-fp-123");
    mockRestoreAuthState.mockResolvedValue(undefined);
  });

  it("starts with loading=true and tenantContext=null", () => {
    mockTenantContextStoreGet.mockResolvedValue(undefined);
    const { result } = renderHook(() => useTenantContext("t-1"));
    expect(result.current.loading).toBe(true);
    expect(result.current.tenantContext).toBeNull();
  });

  it("navigates to home when no tenant context exists", async () => {
    mockTenantContextStoreGet.mockResolvedValue(undefined);

    const { result } = renderHook(() => useTenantContext("t-1"));

    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });

    expect(mockNavigate).toHaveBeenCalledWith({
      to: "/",
      search: { redirect: "/tenant/t-1" },
      replace: true,
    });
    expect(result.current.tenantContext).toBeNull();
  });

  it("navigates to home when device fingerprint does not match", async () => {
    mockTenantContextStoreGet.mockResolvedValue({
      tenantId: "t-1",
      role: "admin",
      deviceId: "different-device",
    });
    mockGetDeviceFingerprint.mockResolvedValue("device-fp-123");

    const { result } = renderHook(() => useTenantContext("t-1"));

    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });

    expect(mockTenantContextStoreDelete).toHaveBeenCalledWith("t-1");
    expect(mockNavigate).toHaveBeenCalledWith({
      to: "/",
      search: { redirect: "/tenant/t-1" },
      replace: true,
    });
  });

  it("redirects to role route when role is not in allowedRoles", async () => {
    mockTenantContextStoreGet.mockResolvedValue({
      tenantId: "t-1",
      role: "gate",
      deviceId: "device-fp-123",
    });

    const { result } = renderHook(() => useTenantContext("t-1", ["admin", "station"]));

    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });

    expect(mockNavigate).toHaveBeenCalledWith({
      to: "/tenant/t-1/gate",
      replace: true,
    });
  });

  it("sets tenantContext when authenticated and role is allowed", async () => {
    const context = {
      tenantId: "t-1",
      role: "admin",
      deviceId: "device-fp-123",
      tenantName: "Test Tenant",
    };
    mockTenantContextStoreGet.mockResolvedValue(context);

    const { result } = renderHook(() => useTenantContext("t-1", ["admin"]));

    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });

    expect(result.current.tenantContext).toEqual(context);
    expect(mockRestoreAuthState).toHaveBeenCalledWith("device-fp-123");
    expect(mockNavigate).not.toHaveBeenCalled();
  });

  it("sets tenantContext when no allowedRoles specified", async () => {
    const context = {
      tenantId: "t-1",
      role: "kiosk",
      deviceId: "device-fp-123",
    };
    mockTenantContextStoreGet.mockResolvedValue(context);

    const { result } = renderHook(() => useTenantContext("t-1"));

    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });

    expect(result.current.tenantContext).toEqual(context);
  });
});

describe("TenantRoutePending", () => {
  it("renders LoadingState with page variant", () => {
    render(<TenantRoutePending />);
    const el = screen.getByTestId("loading-state");
    expect(el.getAttribute("data-variant")).toBe("page");
  });
});
