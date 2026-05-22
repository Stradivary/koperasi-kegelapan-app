import { test, expect } from "@playwright/test";

const API_BASE = "http://localhost:3000";

test.describe("API — Authentication endpoints", () => {
  test("POST /api/auth/token with valid credentials returns token", async ({ request }) => {
    const response = await request.post(`${API_BASE}/api/auth/token`, {
      data: {
        username: "admin-a",
        password: "password",
        deviceFingerprint: {
          hash: "e2e-test-device-001",
          userAgent: "Playwright/e2e",
          platform: "test",
        },
      },
    });

    expect(response.status()).toBe(200);
    const body = await response.json();
    expect(body.accessToken).toBeTruthy();
    expect(body.tenantId).toBeTruthy();
    expect(body.role).toBe("admin");
    expect(body.tenantSlug).toBe("koperasi-a");
  });

  test("POST /api/auth/token with wrong password returns 401", async ({ request }) => {
    const response = await request.post(`${API_BASE}/api/auth/token`, {
      data: {
        username: "admin-a",
        password: "wrongpassword",
        deviceFingerprint: {
          hash: "e2e-test-device-002",
          userAgent: "Playwright/e2e",
          platform: "test",
        },
      },
    });

    expect(response.status()).toBe(401);
  });

  test("POST /api/auth/token with non-existent user returns 401", async ({ request }) => {
    const response = await request.post(`${API_BASE}/api/auth/token`, {
      data: {
        username: "nonexistent-user",
        password: "anypassword",
        deviceFingerprint: {
          hash: "e2e-test-device-003",
          userAgent: "Playwright/e2e",
          platform: "test",
        },
      },
    });

    expect(response.status()).toBe(401);
  });

  test("POST /api/auth/token with superadmin credentials returns superadmin role", async ({
    request,
  }) => {
    const response = await request.post(`${API_BASE}/api/auth/token`, {
      data: {
        username: "superadmin",
        password: "superadmin",
      },
    });

    expect(response.status()).toBe(200);
    const body = await response.json();
    expect(body.accessToken).toBeTruthy();
    expect(body.role).toBe("superadmin");
  });

  test("POST /api/auth/token with tenant slug scoping works", async ({ request }) => {
    const response = await request.post(`${API_BASE}/api/auth/token`, {
      data: {
        username: "admin-a",
        password: "password",
        tenantSlug: "koperasi-a",
        deviceFingerprint: {
          hash: "e2e-test-device-004",
          userAgent: "Playwright/e2e",
          platform: "test",
        },
      },
    });

    expect(response.status()).toBe(200);
    const body = await response.json();
    expect(body.tenantSlug).toBe("koperasi-a");
  });
});

test.describe("API — Protected endpoints without auth", () => {
  test("GET /api/session-grant without token returns 401", async ({ request }) => {
    const response = await request.get(`${API_BASE}/api/session-grant`);
    expect(response.status()).toBe(401);
  });

  test("GET /api/sync/pull without token returns 401", async ({ request }) => {
    const response = await request.get(`${API_BASE}/api/sync/pull`);
    expect(response.status()).toBe(401);
  });

  test("POST /api/sync/push without token returns 401", async ({ request }) => {
    const response = await request.post(`${API_BASE}/api/sync/push`, {
      data: {},
    });
    expect(response.status()).toBe(401);
  });

  test("POST /api/reconcile without token returns 401", async ({ request }) => {
    const response = await request.post(`${API_BASE}/api/reconcile`, {
      data: { events: [] },
    });
    expect(response.status()).toBe(401);
  });

  test("GET /api/superadmin/tenants without token returns 401 or 403", async ({ request }) => {
    const response = await request.get(`${API_BASE}/api/superadmin/tenants`);
    expect([401, 403]).toContain(response.status());
  });
});

test.describe("API — Authenticated requests", () => {
  let adminToken: string;

  test.beforeAll(async ({ request }) => {
    const response = await request.post(`${API_BASE}/api/auth/token`, {
      data: {
        username: "admin-a",
        password: "password",
        deviceFingerprint: {
          hash: "e2e-test-device-auth",
          userAgent: "Playwright/e2e",
          platform: "test",
        },
      },
    });
    const body = await response.json();
    adminToken = body.accessToken;
  });

  test("GET /api/session-grant with valid token returns grant", async ({ request }) => {
    const response = await request.get(`${API_BASE}/api/session-grant`, {
      headers: { Authorization: `Bearer ${adminToken}` },
    });

    expect(response.status()).toBe(200);
    const body = await response.json();
    expect(body).toBeTruthy();
  });

  test("GET /api/sync/pull with valid token returns sync data", async ({ request }) => {
    const response = await request.get(`${API_BASE}/api/sync/pull`, {
      headers: { Authorization: `Bearer ${adminToken}` },
    });

    expect(response.status()).toBe(200);
    const body = await response.json();
    expect(body).toBeTruthy();
  });

  test("POST /api/sync/push with valid token accepts data", async ({ request }) => {
    const response = await request.post(`${API_BASE}/api/sync/push`, {
      headers: { Authorization: `Bearer ${adminToken}` },
      data: {
        members: [],
        cards: [],
        transactions: [],
      },
    });

    // Should accept the push (even if empty)
    expect([200, 204]).toContain(response.status());
  });
});

test.describe("API — Superadmin endpoints", () => {
  let superadminToken: string;

  test.beforeAll(async ({ request }) => {
    const response = await request.post(`${API_BASE}/api/auth/token`, {
      data: {
        username: "superadmin",
        password: "superadmin",
      },
    });
    const body = await response.json();
    superadminToken = body.accessToken;
  });

  test("GET /api/superadmin/tenants returns tenant list", async ({ request }) => {
    const response = await request.get(`${API_BASE}/api/superadmin/tenants`, {
      headers: { Authorization: `Bearer ${superadminToken}` },
    });

    expect(response.status()).toBe(200);
    const body = await response.json();
    expect(body.tenants).toBeDefined();
    expect(Array.isArray(body.tenants)).toBeTruthy();
    expect(body.tenants.length).toBeGreaterThan(0);
  });

  test("GET /api/superadmin/tenants supports pagination", async ({ request }) => {
    const response = await request.get(
      `${API_BASE}/api/superadmin/tenants?page=1&pageSize=5`,
      {
        headers: { Authorization: `Bearer ${superadminToken}` },
      },
    );

    expect(response.status()).toBe(200);
    const body = await response.json();
    expect(body.page).toBe(1);
    expect(body.pageSize).toBe(5);
    expect(body.total).toBeDefined();
  });

  test("GET /api/superadmin/tenants supports search", async ({ request }) => {
    const response = await request.get(
      `${API_BASE}/api/superadmin/tenants?search=koperasi`,
      {
        headers: { Authorization: `Bearer ${superadminToken}` },
      },
    );

    expect(response.status()).toBe(200);
    const body = await response.json();
    expect(body.tenants.length).toBeGreaterThan(0);
  });

  test("GET /api/superadmin/accounts returns account list", async ({ request }) => {
    const response = await request.get(`${API_BASE}/api/superadmin/accounts`, {
      headers: { Authorization: `Bearer ${superadminToken}` },
    });

    expect(response.status()).toBe(200);
    const body = await response.json();
    expect(body.accounts).toBeDefined();
    expect(Array.isArray(body.accounts)).toBeTruthy();
  });

  test("non-superadmin token cannot access superadmin endpoints", async ({ request }) => {
    // Get a regular admin token
    const loginRes = await request.post(`${API_BASE}/api/auth/token`, {
      data: {
        username: "admin-a",
        password: "password",
        deviceFingerprint: {
          hash: "e2e-test-device-nonadmin",
          userAgent: "Playwright/e2e",
          platform: "test",
        },
      },
    });
    const { accessToken } = await loginRes.json();

    const response = await request.get(`${API_BASE}/api/superadmin/tenants`, {
      headers: { Authorization: `Bearer ${accessToken}` },
    });

    expect([401, 403]).toContain(response.status());
  });
});
