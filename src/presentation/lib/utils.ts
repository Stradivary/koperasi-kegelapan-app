import type { ClassValue } from "clsx";
import { clsx } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

const DEVICE_SETUP_LAUNCH_KEY = "device-setup-launch-context";

export interface DeviceSetupLaunchContext {
  returnTo: string;
  returnLabel?: string;
}

export function setDeviceSetupLaunchContext(context: DeviceSetupLaunchContext) {
  if (globalThis.window === undefined) return;
  globalThis.sessionStorage.setItem(DEVICE_SETUP_LAUNCH_KEY, JSON.stringify(context));
}

export function consumeDeviceSetupLaunchContext(): DeviceSetupLaunchContext | null {
  if (globalThis.window === undefined) return null;

  const raw = globalThis.sessionStorage.getItem(DEVICE_SETUP_LAUNCH_KEY);
  if (!raw) return null;

  globalThis.sessionStorage.removeItem(DEVICE_SETUP_LAUNCH_KEY);

  try {
    const parsed = JSON.parse(raw) as Partial<DeviceSetupLaunchContext>;
    if (
      parsed.returnTo === undefined ||
      typeof parsed.returnTo !== "string" ||
      parsed.returnTo.length === 0
    ) {
      return null;
    }

    return {
      returnTo: parsed.returnTo,
      returnLabel: typeof parsed.returnLabel === "string" ? parsed.returnLabel : undefined,
    };
  } catch {
    return null;
  }
}
