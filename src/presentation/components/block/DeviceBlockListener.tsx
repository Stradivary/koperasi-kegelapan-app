/**
 * Invisible component that initializes device block state listeners.
 * Mounted at the root level to ensure block detection works globally.
 * Shows toast notifications and handles navigation on block/unblock events.
 */

import { useDeviceBlock } from "../../hooks/useDeviceBlock";

export function DeviceBlockListener() {
  // The hook handles all side effects (toast, navigation, visibility listener)
  useDeviceBlock();
  return null;
}
