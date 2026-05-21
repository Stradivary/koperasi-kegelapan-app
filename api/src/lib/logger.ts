/**
 * Structured logger for the API worker.
 *
 * Outputs JSON-formatted log lines that integrate with Cloudflare's
 * observability pipeline (Workers Logs, Logpush). Each log entry includes
 * a timestamp, level, message, and optional structured context.
 *
 * Usage:
 *   logger.info("Sync push completed", { tenantId, accepted: 5, rejected: 0 });
 *   logger.warn("Tenant mismatch", { payload: bodyTenantId, token: tokenTenantId });
 *   logger.error("D1 query failed", { error: msg, cardId });
 */

export type LogLevel = "debug" | "info" | "warn" | "error";

interface LogEntry {
  ts: string;
  level: LogLevel;
  msg: string;
  [key: string]: unknown;
}

function emit(level: LogLevel, msg: string, ctx?: Record<string, unknown>): void {
  const entry: LogEntry = {
    ts: new Date().toISOString(),
    level,
    msg,
    ...ctx,
  };

  const line = JSON.stringify(entry);

  switch (level) {
    case "error":
      console.error(line);
      break;
    case "warn":
      console.warn(line);
      break;
    default:
      console.log(line);
  }
}

export const logger = {
  debug: (msg: string, ctx?: Record<string, unknown>) => emit("debug", msg, ctx),
  info: (msg: string, ctx?: Record<string, unknown>) => emit("info", msg, ctx),
  warn: (msg: string, ctx?: Record<string, unknown>) => emit("warn", msg, ctx),
  error: (msg: string, ctx?: Record<string, unknown>) => emit("error", msg, ctx),
};
