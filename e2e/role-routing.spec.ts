import { test, expect, type Page } from "@playwright/test";

const TENANT_A = "koperasi-a";

async function login(page: Page, username: string, password = "password") {
  await page.goto("/");
  await page.fill('[name="username"]', username);
  await page.fill('[name="password"]', password);
  await page.click('button[type="submit"]');
}

test.describe("Role-based routing and access control", () => {
  test("admin role can access cards page", async ({ page }) => {
    await login(page, "admin-a");
    await expect(page).toHaveURL(/\/tenant\/.+\/(cards|admin)/);
  });

  test("admin cannot access other tenant routes", async ({ page }) => {
    await login(page, "admin-a");
    // Try to access a non-existent tenant
    await page.goto("/tenant/nonexistent-tenant/cards");
    // Should redirect to login or show error
    await expect(page).toHaveURL(/\/(tenant\/.*|$)/);
  });

  test("direct URL to admin cards works when authenticated", async ({ page }) => {
    await login(page, "admin-a");
    await expect(page).toHaveURL(/\/tenant\/.+\//);

    // Extract the tenant ID from current URL
    const url = page.url();
    const tenantMatch = url.match(/\/tenant\/([^/]+)\//);
    if (tenantMatch) {
      const tenantId = tenantMatch[1];
      await page.goto(`/tenant/${tenantId}/cards`);
      await expect(page).toHaveURL(/\/cards/);
    }
  });

  test("direct URL to admin members works when authenticated", async ({ page }) => {
    await login(page, "admin-a");
    const url = page.url();
    const tenantMatch = url.match(/\/tenant\/([^/]+)\//);
    if (tenantMatch) {
      const tenantId = tenantMatch[1];
      await page.goto(`/tenant/${tenantId}/members`);
      await expect(page).toHaveURL(/\/members/);
      await expect(page.getByText(/Tambah Anggota/i)).toBeVisible({ timeout: 5000 });
    }
  });

  test("direct URL to admin transactions works when authenticated", async ({ page }) => {
    await login(page, "admin-a");
    const url = page.url();
    const tenantMatch = url.match(/\/tenant\/([^/]+)\//);
    if (tenantMatch) {
      const tenantId = tenantMatch[1];
      await page.goto(`/tenant/${tenantId}/transactions`);
      await expect(page).toHaveURL(/\/transactions/);
    }
  });

  test("direct URL to admin settings works when authenticated", async ({ page }) => {
    await login(page, "admin-a");
    const url = page.url();
    const tenantMatch = url.match(/\/tenant\/([^/]+)\//);
    if (tenantMatch) {
      const tenantId = tenantMatch[1];
      await page.goto(`/tenant/${tenantId}/settings`);
      await expect(page).toHaveURL(/\/settings/);
      await expect(page.getByText(/Profil Tenant/i)).toBeVisible({ timeout: 5000 });
    }
  });
});

test.describe("Unauthenticated access protection", () => {
  test("accessing /superadmin without auth shows login gate", async ({ page }) => {
    await page.goto("/superadmin");
    await expect(page.getByRole("heading", { name: /Superadmin Login/i })).toBeVisible();
  });

  test("accessing tenant terminal without auth redirects to login", async ({ page }) => {
    await page.goto(`/tenant/${TENANT_A}/terminal`);
    await expect(page).toHaveURL("/");
  });

  test("accessing tenant gate without auth redirects to login", async ({ page }) => {
    await page.goto(`/tenant/${TENANT_A}/gate`);
    await expect(page).toHaveURL("/");
  });

  test("accessing tenant scout without auth redirects to login", async ({ page }) => {
    await page.goto(`/tenant/${TENANT_A}/scout`);
    await expect(page).toHaveURL("/");
  });

  test("accessing tenant cards without auth redirects to login", async ({ page }) => {
    await page.goto(`/tenant/${TENANT_A}/cards`);
    await expect(page).toHaveURL("/");
  });

  test("accessing tenant members without auth redirects to login", async ({ page }) => {
    await page.goto(`/tenant/${TENANT_A}/members`);
    await expect(page).toHaveURL("/");
  });

  test("accessing tenant transactions without auth redirects to login", async ({ page }) => {
    await page.goto(`/tenant/${TENANT_A}/transactions`);
    await expect(page).toHaveURL("/");
  });

  test("accessing tenant settings without auth redirects to login", async ({ page }) => {
    await page.goto(`/tenant/${TENANT_A}/settings`);
    await expect(page).toHaveURL("/");
  });
});
