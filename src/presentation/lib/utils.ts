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
  if (typeof window === "undefined") return;
  window.sessionStorage.setItem(DEVICE_SETUP_LAUNCH_KEY, JSON.stringify(context));
}

export function consumeDeviceSetupLaunchContext(): DeviceSetupLaunchContext | null {
  if (typeof window === "undefined") return null;

  const raw = window.sessionStorage.getItem(DEVICE_SETUP_LAUNCH_KEY);
  if (!raw) return null;

  window.sessionStorage.removeItem(DEVICE_SETUP_LAUNCH_KEY);

  try {
    const parsed = JSON.parse(raw) as Partial<DeviceSetupLaunchContext>;
    if (typeof parsed.returnTo !== "string" || parsed.returnTo.length === 0) {
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
