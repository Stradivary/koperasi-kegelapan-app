/**
 * Mock for virtual:pwa-register/react used in test environment.
 */
import { vi } from "vitest";

export const useRegisterSW = vi.fn().mockReturnValue({
  needRefresh: [false],
  offlineReady: [false],
  updateServiceWorker: vi.fn(),
});
