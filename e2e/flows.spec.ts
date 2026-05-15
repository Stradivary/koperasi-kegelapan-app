import { test, expect, type Page } from "@playwright/test";

// Seed credentials (from src/db/seed.ts)
const TENANT_A = "koperasi-a";
const TENANT_B = "koperasi-b";

async function login(page: Page, username: string, password = "password") {
  await page.goto("/");
  await page.fill('[name="username"]', username);
  await page.fill('[name="password"]', password);
  await page.click('button[type="submit"]');
}

test.describe("Auth", () => {
  test("login as admin and see admin dashboard", async ({ page }: any) => {
    await login(page, `${TENANT_A}-admin`);
    await expect(page).toHaveURL(/\/tenant\/.+\/admin/);
    await expect(page.getByRole("heading", { name: /admin/i })).toBeVisible();
  });

  test("wrong password shows error", async ({ page }: any) => {
    await page.goto("/");
    await page.fill('[name="username"]', `${TENANT_A}-admin`);
    await page.fill('[name="password"]', "wrong");
    await page.click('button[type="submit"]');
    await expect(page.getByText(/invalid|salah|gagal/i)).toBeVisible();
  });

  test("login as terminal role redirects to terminal page", async ({ page }: any) => {
    await login(page, `${TENANT_A}-terminal`);
    await expect(page).toHaveURL(/\/tenant\/.+\/terminal/);
  });

  test("login as gate role redirects to gate page", async ({ page }: any) => {
    await login(page, `${TENANT_A}-gate`);
    await expect(page).toHaveURL(/\/tenant\/.+\/gate/);
  });

  test("login as station role redirects to station page", async ({ page }: any) => {
    await login(page, `${TENANT_A}-station`);
    await expect(page).toHaveURL(/\/tenant\/.+\/station/);
  });
});

test.describe("Tenant isolation", () => {
  test("Tenant A admin cannot see Tenant B data", async ({ page }: any) => {
    await login(page, `${TENANT_A}-admin`);
    await expect(page).toHaveURL(new RegExp(`/tenant/${TENANT_A}/`));

    // Navigate directly to tenant B admin — should redirect to login
    await page.goto(`/tenant/${TENANT_B}/admin`);
    await expect(page).toHaveURL("/");
  });

  test("Tenant B login reaches Tenant B routes only", async ({ page }: any) => {
    await login(page, `${TENANT_B}-admin`);
    await expect(page).toHaveURL(new RegExp(`/tenant/${TENANT_B}/`));
  });
});

test.describe("Admin dashboard", () => {
  test.beforeEach(async ({ page }: any) => {
    await login(page, `${TENANT_A}-admin`);
  });

  test("shows card list with seeded cards", async ({ page }: any) => {
    await expect(page.getByRole("heading", { name: /admin/i })).toBeVisible();
    // Seeded 10 cards per tenant
    await expect(page.locator('[data-testid="card-row"], .card-row').first()).toBeVisible({
      timeout: 5000,
    });
  });

  test("shows audit log section", async ({ page }: any) => {
    await expect(page.getByText(/audit|log/i).first()).toBeVisible();
  });
});

test.describe("Station — card management", () => {
  test.beforeEach(async ({ page }: any) => {
    await login(page, `${TENANT_A}-station`);
    await expect(page).toHaveURL(/\/station/);
  });

  test("shows card list", async ({ page }: any) => {
    await expect(page.getByText(/Daftar Kartu/i)).toBeVisible();
  });

  test("register new card flow", async ({ page }: any) => {
    await page.getByText(/Daftarkan Kartu/i).click();
    await page.fill('[placeholder="0102030405ff"]', "aabbccdd0011");
    await page.fill('[type="number"][placeholder="1001"]', "9001");
    await page.fill('[type="number"][placeholder="50000"]', "100000");
    await page.getByRole("button", { name: /Daftarkan/ }).click();
    await expect(page.getByText(/berhasil didaftarkan/i)).toBeVisible();
  });

  test("cannot register duplicate card ID", async ({ page }: any) => {
    // Register first time
    await page.getByText(/Daftarkan Kartu/i).click();
    await page.fill('[placeholder="0102030405ff"]', "duplicate001122");
    await page.fill('[type="number"][placeholder="50000"]', "0");
    await page.getByRole("button", { name: /Daftarkan/ }).click();

    // Try again with same ID
    await page.getByText(/Daftarkan Kartu/i).click();
    await page.fill('[placeholder="0102030405ff"]', "duplicate001122");
    await page.fill('[type="number"][placeholder="50000"]', "0");
    await page.getByRole("button", { name: /Daftarkan/ }).click();
    await expect(page.getByText(/error|gagal|sudah/i)).toBeVisible();
  });

  test("block card action", async ({ page }: any) => {
    // First card in list should have Blokir button
    const blockBtn = page.getByRole("button", { name: /Blokir/ }).first();
    await expect(blockBtn).toBeVisible();
    await blockBtn.click();
    // Status should change
    await expect(page.getByText(/blocked_admin/).first()).toBeVisible({ timeout: 3000 });
  });
});

test.describe("Scout — balance check (no NFC on desktop)", () => {
  test("scout page shows scan button", async ({ page }: any) => {
    await login(page, `${TENANT_A}-station`); // station can access scout-like views
    await page.goto(page.url().replace("/station", "/scout"));
    // Scout page should render even without NFC hardware
    await expect(page.getByText(/Cek Saldo|Tempelkan/i)).toBeVisible();
  });
});

test.describe("Session expiry protection", () => {
  test("unauthenticated direct URL access redirects to login", async ({ page }: any) => {
    await page.goto(`/tenant/${TENANT_A}/terminal`);
    await expect(page).toHaveURL("/");
  });

  test("unauthenticated admin access redirects to login", async ({ page }: any) => {
    await page.goto(`/tenant/${TENANT_A}/admin`);
    await expect(page).toHaveURL("/");
  });
});
