import { Hono } from "hono";

type Env = {
  DB: D1Database;
  SESSION_MASTER_KEY: string;
};

// ─── Types ───────────────────────────────────────────────────────────────────

export type SyncEventType =
  | "card_status_change"
  | "member_update"
  | "transaction"
  | "checkin"
  | "checkout";

export interface SyncSseEvent {
  type: SyncEventType;
  payload: Record<string, unknown>;
  timestamp: number;
  sourceDeviceId: string;
}

interface ConnectedClient {
  tenantId: string;
  deviceId: string;
  controller: ReadableStreamDefaultController;
}

// ─── Token Payload Extraction ────────────────────────────────────────────────

interface TokenPayload {
  tenantId: string;
  accountId: string;
  deviceId?: string;
}

function extractTokenPayload(request: Request): TokenPayload | null {
  // Check Authorization header first
  const authHeader = request.headers.get("authorization") ?? "";
  if (authHeader.startsWith("Bearer ")) {
    const token = authHeader.slice(7);
    return parseToken(token);
  }

  // Fallback: check query parameter (for EventSource which can't set headers)
  const url = new URL(request.url);
  const token = url.searchParams.get("token");
  if (token) {
    return parseToken(token);
  }

  return null;
}

function parseToken(token: string): TokenPayload | null {
  if (!token) return null;

  try {
    const parts = token.split(".");
    if (parts.length < 2) return null;
    const payload = JSON.parse(atob(parts[1]));
    if (!payload.tenantId || !payload.accountId) return null;
    return {
      tenantId: payload.tenantId,
      accountId: payload.accountId,
      deviceId: payload.deviceId ?? undefined,
    };
  } catch {
    return null;
  }
}

// ─── In-Memory Connection Store ──────────────────────────────────────────────
// Note: This is per-isolate. In Cloudflare Workers, each isolate maintains its
// own set of connections. For multi-isolate broadcast, use Durable Objects or KV.
// For single-isolate deployments (typical for most workloads), this works well.

const connectedClients: Set<ConnectedClient> = new Set();

/**
 * Broadcast an event to all connected clients for a specific tenant.
 * Clients matching the sourceDeviceId will still receive the event —
 * filtering is done client-side so the client can decide.
 */
export function broadcastToTenant(tenantId: string, event: SyncSseEvent): void {
  const data = `data: ${JSON.stringify(event)}\n\n`;
  const encoder = new TextEncoder();
  const encoded = encoder.encode(data);

  for (const client of connectedClients) {
    if (client.tenantId !== tenantId) continue;

    try {
      client.controller.enqueue(encoded);
    } catch {
      // Client disconnected — remove from set
      connectedClients.delete(client);
    }
  }
}

// ─── Routes ──────────────────────────────────────────────────────────────────

export const syncSseRoutes = new Hono<{ Bindings: Env }>();

/**
 * GET /sse — Server-Sent Events endpoint for real-time sync.
 *
 * Authentication: requires a valid auth token via query parameter `token`
 * (EventSource API doesn't support custom headers).
 *
 * The connection stays open and receives events for the authenticated tenant.
 * Events include sourceDeviceId so clients can ignore their own events.
 *
 * @see Requirements 5.1, 8.2
 */
syncSseRoutes.get("/sse", async (c) => {
  // Authenticate the SSE connection
  const tokenPayload = extractTokenPayload(c.req.raw);
  if (!tokenPayload) {
    return c.json({ error: "Authentication required" }, 401);
  }

  if (!tokenPayload.deviceId) {
    return c.json({ error: "Device ID required in token" }, 400);
  }

  const { tenantId, deviceId } = tokenPayload;

  // Create a readable stream for SSE
  const stream = new ReadableStream({
    start(controller) {
      // Register this client
      const client: ConnectedClient = {
        tenantId,
        deviceId,
        controller,
      };
      connectedClients.add(client);

      // Send initial connection event
      const encoder = new TextEncoder();
      const connectEvent = `data: ${JSON.stringify({
        type: "connected",
        payload: { deviceId, tenantId },
        timestamp: Math.floor(Date.now() / 1000),
        sourceDeviceId: "server",
      })}\n\n`;
      controller.enqueue(encoder.encode(connectEvent));

      // Send periodic keepalive comments to prevent connection timeout
      const keepaliveInterval = setInterval(() => {
        try {
          controller.enqueue(encoder.encode(": keepalive\n\n"));
        } catch {
          // Connection closed
          clearInterval(keepaliveInterval);
          connectedClients.delete(client);
        }
      }, 30_000); // Every 30 seconds

      // Cleanup when the stream is cancelled (client disconnects)
      // Note: In Cloudflare Workers, the cancel callback is called when
      // the client closes the connection.
    },
    cancel() {
      // Remove client from connected set when they disconnect
      for (const client of connectedClients) {
        if (client.tenantId === tenantId && client.deviceId === deviceId) {
          connectedClients.delete(client);
          break;
        }
      }
    },
  });

  // Return SSE response with appropriate headers
  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      Connection: "keep-alive",
      "X-Accel-Buffering": "no",
    },
  });
});

/**
 * POST /broadcast — Broadcast an event to all connected clients for a tenant.
 *
 * This endpoint is called internally by other API routes (e.g., the card block
 * endpoint) to push real-time events to connected devices.
 *
 * Authentication: requires a valid auth token.
 *
 * Body: { type, payload, sourceDeviceId? }
 *
 * @see Requirements 5.1, 8.2
 */
syncSseRoutes.post("/broadcast", async (c) => {
  // Authenticate
  const tokenPayload = extractTokenPayload(c.req.raw);
  if (!tokenPayload) {
    return c.json({ error: "Authentication required" }, 401);
  }

  const body = await c.req
    .json<{
      type: SyncEventType;
      payload: Record<string, unknown>;
      sourceDeviceId?: string;
    }>()
    .catch(() => null);

  if (!body || !body.type || !body.payload) {
    return c.json({ error: "Invalid request body: type and payload required" }, 400);
  }

  const validTypes: SyncEventType[] = [
    "card_status_change",
    "member_update",
    "transaction",
    "checkin",
    "checkout",
  ];

  if (!validTypes.includes(body.type)) {
    return c.json({ error: `Invalid event type. Must be one of: ${validTypes.join(", ")}` }, 400);
  }

  const event: SyncSseEvent = {
    type: body.type,
    payload: body.payload,
    timestamp: Math.floor(Date.now() / 1000),
    sourceDeviceId: body.sourceDeviceId ?? tokenPayload.deviceId ?? "unknown",
  };

  // Broadcast to all connected clients for this tenant
  broadcastToTenant(tokenPayload.tenantId, event);

  return c.json({
    success: true,
    connectedClients: [...connectedClients].filter(
      (client) => client.tenantId === tokenPayload.tenantId,
    ).length,
  });
});

/**
 * Get the number of connected clients (for diagnostics).
 */
export function getConnectedClientCount(tenantId?: string): number {
  if (tenantId) {
    return [...connectedClients].filter((c) => c.tenantId === tenantId).length;
  }
  return connectedClients.size;
}
