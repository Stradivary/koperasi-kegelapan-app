// @vitest-environment jsdom
/**
 * Tests for src/hooks/useLocalSetup.ts
 *
 * Covers:
 * - handleNextStep: slug validation, uniqueness check, step advancement
 * - handleSetup: password validation, tenant creation, context storage, completion
 * - Slug debounce validation
 * - Error and loading state management
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { renderHook, act } from "@testing-library/react";

// ── Mocks ─────────────────────────────────────────────────────────────────────

const mockTenantContextStorePut = vi.fn();
const mockLocalAccountStoreGetByTenant = vi.fn();
vi.mock("#/lib/indexeddb.lazy", () => ({
  getTenantContextStore: () =>
    Promise.resolve({
      put: (...args: unknown[]) => mockTenantContextStorePut(...args),
    }),
  getLocalAccountStore: () =>
    Promise.resolve({
      getByTenant: (...args: unknown[]) => mockLocalAccountStoreGetByTenant(...args),
    }),
}));

const mockIsSlugTaken = vi.fn();
const mockSetupLocalTenant = vi.fn();
vi.mock("#/lib/localTenant", () => ({
  isSlugTaken: (...args: unknown[]) => mockIsSlugTaken(...args),
  setupLocalTenant: (...args: unknown[]) => mockSetupLocalTenant(...args),
}));

const mockValidateSlugFormat = vi.fn();
const mockCreateSlug = vi.fn();
vi.mock("#/lib/utils/slugValidation", () => ({
  validateSlugFormat: (...args: unknown[]) => mockValidateSlugFormat(...args),
  createSlug: (...args: unknown[]) => mockCreateSlug(...args),
}));

const mockGetDeviceFingerprint = vi.fn();
vi.mock("#/lib/getOrCreateDeviceId", () => ({
  getDeviceFingerprint: () => mockGetDeviceFingerprint(),
}));

const mockSyncToServer = vi.fn();
vi.mock("#/hooks/useTenantSync", () => ({
  useTenantSync: () => ({ syncToServer: mockSyncToServer }),
}));

// ── Setup ─────────────────────────────────────────────────────────────────────

beforeEach(() => {
  vi.clearAllMocks();
  vi.useFakeTimers();

  mockIsSlugTaken.mockResolvedValue({ taken: false });
  mockSetupLocalTenant.mockResolvedValue({
    tenantId: "tenant-1",
    slug: "koperasi-maju",
    name: "Koperasi Maju",
  });
  mockTenantContextStorePut.mockResolvedValue(undefined);
  mockGetDeviceFingerprint.mockResolvedValue("fp-hash-123");
  mockSyncToServer.mockResolvedValue(undefined);
  mockLocalAccountStoreGetByTenant.mockResolvedValue([{ role: "admin", passwordHash: "hash-abc" }]);
  mockValidateSlugFormat.mockReturnValue(null); // no format error by default
  mockCreateSlug.mockImplementation((name: string) => name.toLowerCase().replaceAll(/\s+/g, "-"));

  Object.defineProperty(navigator, "onLine", { value: false, configurable: true });
});

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
  Object.defineProperty(navigator, "onLine", { value: true, configurable: true });
});

// ── Initial state ─────────────────────────────────────────────────────────────

describe("useLocalSetup - initial state", () => {
  it("starts at tenant step with empty fields", async () => {
    const { useLocalSetup } = await import("../useLocalSetup");
    const { result } = renderHook(() => useLocalSetup({ onComplete: vi.fn() }));

    expect(result.current.step).toBe("tenant");
    expect(result.current.tenantName).toBe("");
    expect(result.current.tenantSlug).toBe("");
    expect(result.current.slugError).toBeNull();
    expect(result.current.adminUsername).toBe("");
    expect(result.current.adminPassword).toBe("");
    expect(result.current.confirmPassword).toBe("");
    expect(result.current.error).toBeNull();
    expect(result.current.loading).toBe(false);
  });
});

// ── handleNextStep ────────────────────────────────────────────────────────────

describe("useLocalSetup - handleNextStep", () => {
  it("advances to admin step when slug is valid and not taken", async () => {
    const { useLocalSetup } = await import("../useLocalSetup");
    const { result } = renderHook(() => useLocalSetup({ onComplete: vi.fn() }));

    act(() => {
      result.current.setTenantName("Koperasi Maju");
    });

    await act(async () => {
      await result.current.handleNextStep();
    });

    expect(result.current.step).toBe("admin");
  });

  it("pre-populates adminUsername with slug-admin on step advance", async () => {
    const { useLocalSetup } = await import("../useLocalSetup");
    const { result } = renderHook(() => useLocalSetup({ onComplete: vi.fn() }));

    act(() => {
      result.current.setTenantName("Koperasi Maju");
    });

    await act(async () => {
      await result.current.handleNextStep();
    });

    expect(result.current.adminUsername).toBe("koperasi-maju-admin");
  });

  it("uses explicit tenantSlug over generated slug", async () => {
    const { useLocalSetup } = await import("../useLocalSetup");
    const { result } = renderHook(() => useLocalSetup({ onComplete: vi.fn() }));

    act(() => {
      result.current.setTenantName("Koperasi Maju");
      result.current.setTenantSlug("custom-slug");
    });

    await act(async () => {
      await result.current.handleNextStep();
    });

    expect(result.current.adminUsername).toBe("custom-slug-admin");
    expect(mockIsSlugTaken).toHaveBeenCalledWith("custom-slug");
  });

  it("sets slugError and stays on tenant step when slug format is invalid", async () => {
    const { useLocalSetup } = await import("../useLocalSetup");
    mockValidateSlugFormat.mockReturnValue("Slug tidak valid");

    const { result } = renderHook(() => useLocalSetup({ onComplete: vi.fn() }));

    act(() => {
      result.current.setTenantName("Koperasi Maju");
    });

    await act(async () => {
      await result.current.handleNextStep();
    });

    expect(result.current.slugError).toBe("Slug tidak valid");
    expect(result.current.step).toBe("tenant");
  });

  it("sets slugError and stays on tenant step when slug is already taken locally", async () => {
    const { useLocalSetup } = await import("../useLocalSetup");
    mockIsSlugTaken.mockResolvedValue({ taken: true, source: "local" });

    const { result } = renderHook(() => useLocalSetup({ onComplete: vi.fn() }));

    act(() => {
      result.current.setTenantName("Koperasi Maju");
    });

    await act(async () => {
      await result.current.handleNextStep();
    });

    expect(result.current.slugError).toContain("sudah digunakan");
    expect(result.current.step).toBe("tenant");
  });

  it("sets slugError with remote message when slug is taken on server", async () => {
    const { useLocalSetup } = await import("../useLocalSetup");
    mockIsSlugTaken.mockResolvedValue({ taken: true, source: "remote" });

    const { result } = renderHook(() => useLocalSetup({ onComplete: vi.fn() }));

    act(() => {
      result.current.setTenantName("Koperasi Maju");
    });

    await act(async () => {
      await result.current.handleNextStep();
    });

    expect(result.current.slugError).toContain("sudah terdaftar di server");
    expect(result.current.step).toBe("tenant");
  });
});

// ── handleSetup ───────────────────────────────────────────────────────────────

describe("useLocalSetup - handleSetup: password validation", () => {
  async function getHookAtAdminStep() {
    const { useLocalSetup } = await import("../useLocalSetup");
    const onComplete = vi.fn();
    const { result } = renderHook(() => useLocalSetup({ onComplete }));

    act(() => {
      result.current.setTenantName("Koperasi Maju");
    });
    await act(async () => {
      await result.current.handleNextStep();
    });
    expect(result.current.step).toBe("admin");

    return { result, onComplete };
  }

  it("sets error when passwords do not match", async () => {
    const { result } = await getHookAtAdminStep();

    act(() => {
      result.current.setAdminPassword("password123");
      result.current.setConfirmPassword("different456");
    });

    await act(async () => {
      await result.current.handleSetup();
    });

    expect(result.current.error).toContain("tidak cocok");
    expect(result.current.step).toBe("admin");
  });

  it("sets error when password is shorter than 6 characters", async () => {
    const { result } = await getHookAtAdminStep();

    act(() => {
      result.current.setAdminPassword("abc");
      result.current.setConfirmPassword("abc");
    });

    await act(async () => {
      await result.current.handleSetup();
    });

    expect(result.current.error).toContain("minimal 6 karakter");
  });
});

describe("useLocalSetup - handleSetup: successful setup", () => {
  async function getHookReadyForSetup() {
    const { useLocalSetup } = await import("../useLocalSetup");
    const onComplete = vi.fn();
    const { result } = renderHook(() => useLocalSetup({ onComplete }));

    act(() => {
      result.current.setTenantName("Koperasi Maju");
    });
    await act(async () => {
      await result.current.handleNextStep();
    });
    act(() => {
      result.current.setAdminPassword("password123");
      result.current.setConfirmPassword("password123");
    });

    return { result, onComplete };
  }

  it("calls setupLocalTenant with correct params", async () => {
    const { result } = await getHookReadyForSetup();

    await act(async () => {
      await result.current.handleSetup();
    });

    expect(mockSetupLocalTenant).toHaveBeenCalledWith(
      expect.objectContaining({
        name: "Koperasi Maju",
        adminPassword: "password123",
      }),
    );
  });

  it("stores tenant context after successful setup", async () => {
    const { result } = await getHookReadyForSetup();

    await act(async () => {
      await result.current.handleSetup();
    });

    expect(mockTenantContextStorePut).toHaveBeenCalledWith(
      expect.objectContaining({
        tenantId: "tenant-1",
        role: "admin",
        canAccessStation: true,
      }),
    );
  });

  it("transitions to done step after successful setup", async () => {
    const { result } = await getHookReadyForSetup();

    await act(async () => {
      await result.current.handleSetup();
    });

    expect(result.current.step).toBe("done");
    expect(result.current.loading).toBe(false);
  });

  it("calls onComplete with tenantId and admin role after delay", async () => {
    const { result, onComplete } = await getHookReadyForSetup();

    await act(async () => {
      await result.current.handleSetup();
    });

    expect(onComplete).not.toHaveBeenCalled(); // not yet - 1200ms delay

    await act(async () => {
      vi.advanceTimersByTime(1200);
    });

    expect(onComplete).toHaveBeenCalledWith("tenant-1", "admin");
  });

  it("does not sync to server when offline", async () => {
    const { result } = await getHookReadyForSetup();
    Object.defineProperty(navigator, "onLine", { value: false, configurable: true });

    await act(async () => {
      await result.current.handleSetup();
    });

    expect(mockSyncToServer).not.toHaveBeenCalled();
  });

  it("attempts server sync when online (fire-and-forget)", async () => {
    const { result } = await getHookReadyForSetup();
    Object.defineProperty(navigator, "onLine", { value: true, configurable: true });

    await act(async () => {
      await result.current.handleSetup();
    });

    // syncToServer is fire-and-forget; just verify setup completed
    expect(result.current.step).toBe("done");
    expect(mockSyncToServer).toHaveBeenCalled();
  });
});

describe("useLocalSetup - handleSetup: error handling", () => {
  it("sets error and clears loading when setupLocalTenant throws", async () => {
    const { useLocalSetup } = await import("../useLocalSetup");
    mockSetupLocalTenant.mockRejectedValue(new Error("DB write failed"));

    const { result } = renderHook(() => useLocalSetup({ onComplete: vi.fn() }));

    act(() => {
      result.current.setTenantName("Koperasi Maju");
    });
    await act(async () => {
      await result.current.handleNextStep();
    });
    act(() => {
      result.current.setAdminPassword("password123");
      result.current.setConfirmPassword("password123");
    });

    await act(async () => {
      await result.current.handleSetup();
    });

    expect(result.current.error).toContain("DB write failed");
    expect(result.current.loading).toBe(false);
    expect(result.current.step).toBe("admin");
  });
});

// ── Slug debounce validation ──────────────────────────────────────────────────

describe("useLocalSetup - slug debounce validation", () => {
  it("validates slug after 300ms debounce", async () => {
    const { useLocalSetup } = await import("../useLocalSetup");
    mockIsSlugTaken.mockResolvedValue({ taken: true, source: "local" });

    const { result } = renderHook(() => useLocalSetup({ onComplete: vi.fn() }));

    act(() => {
      result.current.setTenantSlug("taken-slug");
    });

    // Before debounce fires
    expect(mockIsSlugTaken).not.toHaveBeenCalled();

    await act(async () => {
      vi.advanceTimersByTime(300);
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(mockIsSlugTaken).toHaveBeenCalledWith("taken-slug");
  });

  it("clears slugError when slug is valid and available", async () => {
    const { useLocalSetup } = await import("../useLocalSetup");

    const { result } = renderHook(() => useLocalSetup({ onComplete: vi.fn() }));

    // First set a slug that causes a format error
    mockValidateSlugFormat.mockReturnValue("Format salah");
    act(() => {
      result.current.setTenantSlug("bad-slug");
    });

    await act(async () => {
      vi.advanceTimersByTime(300);
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(result.current.slugError).toBe("Format salah");

    // Now fix the slug - format is valid and not taken
    mockValidateSlugFormat.mockReturnValue(null);
    mockIsSlugTaken.mockResolvedValue({ taken: false });
    act(() => {
      result.current.setTenantSlug("good-slug");
    });

    await act(async () => {
      vi.advanceTimersByTime(300);
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(result.current.slugError).toBeNull();
  });

  it("sets slugError from format validation during debounce", async () => {
    const { useLocalSetup } = await import("../useLocalSetup");
    mockValidateSlugFormat.mockReturnValue("Karakter tidak valid");

    const { result } = renderHook(() => useLocalSetup({ onComplete: vi.fn() }));

    act(() => {
      result.current.setTenantSlug("invalid slug!");
    });

    await act(async () => {
      vi.advanceTimersByTime(300);
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(result.current.slugError).toBe("Karakter tidak valid");
  });
});

// ── setStep ───────────────────────────────────────────────────────────────────

describe("useLocalSetup - setStep", () => {
  it("allows manually setting step back to tenant", async () => {
    const { useLocalSetup } = await import("../useLocalSetup");
    const { result } = renderHook(() => useLocalSetup({ onComplete: vi.fn() }));

    act(() => {
      result.current.setTenantName("Koperasi Maju");
    });
    await act(async () => {
      await result.current.handleNextStep();
    });
    expect(result.current.step).toBe("admin");

    act(() => {
      result.current.setStep("tenant");
    });

    expect(result.current.step).toBe("tenant");
  });
});
