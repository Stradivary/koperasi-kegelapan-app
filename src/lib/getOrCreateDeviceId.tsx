const CACHE_KEY = "koperasi-device-fp";

async function computeFingerprint(): Promise<string> {
  // Canvas fingerprint
  const canvas = document.createElement("canvas");
  canvas.width = 240;
  canvas.height = 60;
  const ctx = canvas.getContext("2d")!;
  ctx.fillStyle = "#f0e";
  ctx.fillRect(0, 0, 240, 60);
  ctx.fillStyle = "#069";
  ctx.font = "bold 14px 'Arial'";
  ctx.fillText("Koperasi Wallet v2", 4, 20);
  ctx.fillStyle = "rgba(80, 200, 50, 0.8)";
  ctx.beginPath();
  ctx.arc(60, 45, 12, 0, Math.PI * 2);
  ctx.fill();
  const canvasData = canvas.toDataURL("image/png");

  const signals = [
    canvasData,
    navigator.userAgent,
    String(navigator.hardwareConcurrency ?? 0),
    `${screen.width}x${screen.height}x${screen.colorDepth}`,
    Intl.DateTimeFormat().resolvedOptions().timeZone,
    navigator.language,
  ].join("|fp|");

  const encoded = new TextEncoder().encode(signals);
  const hashBuffer = await crypto.subtle.digest("SHA-256", encoded);
  return Array.from(new Uint8Array(hashBuffer))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("")
    .slice(0, 32);
}

export async function getDeviceFingerprint(): Promise<string> {
  const cached = sessionStorage.getItem(CACHE_KEY);
  if (cached) return cached;
  const fp = await computeFingerprint();
  sessionStorage.setItem(CACHE_KEY, fp);
  return fp;
}

/**
 * @deprecated Use getDeviceFingerprint() instead. Kept for backward compat during migration.
 */
export function getOrCreateDeviceId(): string {
  const key = "koperasi-device-id";
  let id = localStorage.getItem(key);
  if (!id) {
    id = crypto.randomUUID();
    localStorage.setItem(key, id);
  }
  return id;
}
