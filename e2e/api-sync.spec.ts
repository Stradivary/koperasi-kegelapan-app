import { test, expect } from "@playwright/test";

const API_BASE = "http://localhost:3000";

async function getAdminToken(request: any): Promise<string> {
  const response = await request.post(`${API_BASE}/api/auth/token`, {
    data: {
      username: "admin-a",
      password: "password",
      deviceFingerprint: {
        hash: "e2e-sync-test-device",
        userAgent: "Playwright/e2e-sync",
        platform: "test",
      },
    },
  });
  const body = await response.json();
  return body.accessToken;
}

test.describe("API — Sync endpoints", () => {
  let token: string;

  test.beforeAll(async ({ request }) => {
    token = await getAdminToken(request);
  });

  test("GET /api/sync/pull returns structured sync data", async ({ request }) => {
    const response = await request.get(`${API_BASE}/api/sync/pull`, {
      headers: { Authorization: `Bearer ${token}` },
    });

    expect(response.status()).toBe(200);
    const body = await response.json();

    // Should have sync data structure
    expect(body).toBeTruthy();
    // Typical sync pull response has members, cards, etc.
    if (body.members !== undefined) {
      expect(Array.isArray(body.members)).toBeTruthy();
    }
    if (body.cards !== undefined) {
      expect(Array.isArray(body.cards)).toBeTruthy();
    }
  });

  test("POST /api/sync/push with empty arrays succeeds", async ({ request }) => {
    const response = await request.post(`${API_BASE}/api/sync/push`, {
      headers: { Authorization: `Bearer ${token}` },
      data: {
        members: [],
        cards: [],
        transactions: [],
      },
    });

    expect([200, 204]).toContain(response.status());
  });

  test("POST /api/sync/push with member data succeeds", async ({ request }) => {
    const now = Math.floor(Date.now() / 1000);
    const response = await request.post(`${API_BASE}/api/sync/push`, {
      headers: { Authorization: `Bearer ${token}` },
      data: {
        members: [
          {
            userId: `e2e-sync-member-${Date.now()}`,
            name: "E2E Sync Test Member",
            status: "active",
            createdAt: now,
            updatedAt: now,
          },
        ],
        cards: [],
        transactions: [],
      },
    });

    expect([200, 204]).toContain(response.status());
  });

  test("POST /api/sync/push with card data succeeds", async ({ request }) => {
    const now = Math.floor(Date.now() / 1000);
    const cardId = `e2e${Date.now().toString(16).slice(-8)}ab`;

    const response = await request.post(`${API_BASE}/api/sync/push`, {
      headers: { Authorization: `Bearer ${token}` },
      data: {
        members: [],
        cards: [
          {
            cardId,
            userId: null,
            status: "active",
            balance: 50000,
            counter: 1,
            keyVersion: 1,
            createdAt: now,
            lastActivityAt: now,
            expiresAt: null,
            notes: "E2E test card",
          },
        ],
        transactions: [],
      },
    });

    expect([200, 204]).toContain(response.status());
  });

  test("GET /api/sync/devices returns device list", async ({ request }) => {
    const response = await request.get(`${API_BASE}/api/sync/devices`, {
      headers: { Authorization: `Bearer ${token}` },
    });

    expect(response.status()).toBe(200);
    const body = await response.json();
    expect(body.devices).toBeDefined();
    expect(Array.isArray(body.devices)).toBeTruthy();
  });
});

test.describe("API — Sync rate limiting", () => {
  let token: string;

  test.beforeAll(async ({ request }) => {
    token = await getAdminToken(request);
  });

  test("rapid sync requests are handled gracefully", async ({ request }) => {
    // Send multiple rapid requests — should not crash
    const promises = Array.from({ length: 5 }, () =>
      request.get(`${API_BASE}/api/sync/pull`, {
        headers: { Authorization: `Bearer ${token}` },
      }),
    );

    const responses = await Promise.all(promises);

    // All should succeed or get rate-limited (429), not error (500)
    for (const response of responses) {
      expect([200, 429]).toContain(response.status());
    }
  });
});

test.describe("API — Client errors endpoint", () => {
  test("POST /api/client-errors accepts error reports", async ({ request }) => {
    const response = await request.post(`${API_BASE}/api/client-errors`, {
      data: {
        errors: [
          {
            category: "e2e_test",
            message: "E2E test error report",
            context: { test: true },
            timestamp: Date.now(),
          },
        ],
      },
    });

    // Should accept error reports (no auth required for client error reporting)
    expect([200, 204]).toContain(response.status());
  });
});
