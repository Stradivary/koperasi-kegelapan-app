/**
 * React hook for device block state management.
 *
 * Provides reactive access to the device block state, displays toast
 * notifications when a block is detected, and exposes utilities for
 * the sync engine to check block status before making requests.
 */

import { useCallback, useEffect, useRef, useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import { toast } from "sonner";
import {
  type DeviceBlockState,
  getDeviceBlockState,
  subscribeToDeviceBlock,
  isDeviceBlocked,
  onDeviceUnblock,
  formatBlockedUntil,
  setupBlockVisibilityHandler,
} from "../lib/deviceBlock";

export interface UseDeviceBlockReturn {
  /** Whether the device is currently blocked */
  blocked: boolean;
  /** Unix timestamp (seconds) when the block expires, or null */
  blockedUntil: number | null;
  /** Formatted string of the unblock time for display */
  blockedUntilFormatted: string | null;
  /** Check if device is blocked (includes local clock expiry check) */
  checkBlocked: () => boolean;
}

/**
 * Hook that subscribes to device block state changes and shows
 * a toast notification when the device is blocked.
 *
 * Also sets up the visibility change handler for checking block
 * expiry when the user returns to the tab.
 */
export function useDeviceBlock(): UseDeviceBlockReturn {
  const navigate = useNavigate();
  const [blockState, setBlockState] = useState<DeviceBlockState>(getDeviceBlockState);
  const hasShownToast = useRef(false);

  // Subscribe to block state changes
  useEffect(() => {
    const unsubscribe = subscribeToDeviceBlock((state) => {
      setBlockState(state);

      // Show toast when newly blocked
      if (state.blocked && state.blockedUntil && !hasShownToast.current) {
        hasShownToast.current = true;
        const formatted = formatBlockedUntil(state.blockedUntil);
        toast.error(`Perangkat diblokir hingga ${formatted}`, {
          duration: 10000,
          description: "Sesi telah dihapus. Anda akan dialihkan ke halaman login.",
        });

        // Redirect to login after a short delay
        setTimeout(() => {
          navigate({ to: "/", replace: true });
        }, 2000);
      }

      // Reset toast flag when unblocked
      if (!state.blocked) {
        hasShownToast.current = false;
      }
    });

    return unsubscribe;
  }, [navigate]);

  // Set up visibility change handler for block expiry detection
  useEffect(() => {
    const cleanup = setupBlockVisibilityHandler();
    return cleanup;
  }, []);

  // Register re-auth callback on unblock
  useEffect(() => {
    onDeviceUnblock(() => {
      // When block expires, redirect to login for re-authentication
      toast.info("Blokir perangkat telah berakhir. Silakan login kembali.", {
        duration: 5000,
      });
      navigate({ to: "/", replace: true });
    });
  }, [navigate]);

  const checkBlocked = useCallback(() => {
    return isDeviceBlocked();
  }, []);

  const blockedUntilFormatted = blockState.blockedUntil
    ? formatBlockedUntil(blockState.blockedUntil)
    : null;

  return {
    blocked: blockState.blocked,
    blockedUntil: blockState.blockedUntil,
    blockedUntilFormatted,
    checkBlocked,
  };
}
