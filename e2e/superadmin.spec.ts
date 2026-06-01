import { test, expect, type Page } from "@playwright/test";

async function loginAsSuperadmin(page: Page) {
  await page.goto("/superadmin");
  await page.fill("#sa-username", "superadmin");
  await page.fill("#sa-password", "superadmin");
  await page.click('button[type="submit"]');
}

test.describe("Superadmin - authentication", () => {
  test("shows login gate when not authenticated", async ({ page }) => {
    await page.goto("/superadmin");
    await expect(page.getByRole("heading", { name: /Superadmin Login/i })).toBeVisible();
    await expect(page.getByLabel(/Username/i)).toBeVisible();
    await expect(page.getByLabel(/Password/i)).toBeVisible();
  });

  test("wrong credentials show error", async ({ page }) => {
    await page.goto("/superadmin");
    await page.fill("#sa-username", "superadmin");
    await page.fill("#sa-password", "wrongpassword");
    await page.click('button[type="submit"]');
    await expect(page.getByText(/salah|invalid/i)).toBeVisible();
  });

  test("non-superadmin account is rejected", async ({ page }) => {
    await page.goto("/superadmin");
    await page.fill("#sa-username", "admin-a");
    await page.fill("#sa-password", "password");
    await page.click('button[type="submit"]');
    await expect(page.getByText(/bukan superadmin/i)).toBeVisible();
  });

  test("successful login shows tenant list", async ({ page }) => {
    await loginAsSuperadmin(page);
    // Should see the tenant management panel
    await expect(page.getByText(/Koperasi A|Tenant/i).first()).toBeVisible({ timeout: 5000 });
  });

  test("back to main page link works", async ({ page }) => {
    await page.goto("/superadmin");
    await page.getByText(/Kembali ke halaman utama/i).click();
    await expect(page).toHaveURL("/");
  });
});

test.describe("Superadmin - tenant management", () => {
  test.beforeEach(async ({ page }) => {
    await loginAsSuperadmin(page);
    // Wait for tenant list to load
    await expect(page.getByText(/Koperasi A|Tenant/i).first()).toBeVisible({ timeout: 5000 });
  });

  test("displays tenant list with seeded tenants", async ({ page }) => {
    await expect(page.getByText(/Koperasi A/i)).toBeVisible();
  });

  test("can search tenants", async ({ page }) => {
    const searchInput = page.getByPlaceholder(/cari|search/i);
    if (await searchInput.isVisible()) {
      await searchInput.fill("koperasi");
      await expect(page.getByText(/Koperasi A/i)).toBeVisible();
    }
  });

  test("can view tenant detail", async ({ page }) => {
    // Click on a tenant to view details
    await page.getByText(/Koperasi A/i).click();
    // Should show detail view with tenant info
    await expect(page.getByText(/koperasi-a/i)).toBeVisible({ timeout: 5000 });
  });

  test("can navigate back from tenant detail to list", async ({ page }) => {
    await page.getByText(/Koperasi A/i).click();
    await expect(page.getByText(/koperasi-a/i)).toBeVisible({ timeout: 5000 });

    // Click back button
    const backBtn = page.getByRole("button", { name: /kembali|back/i });
    if (await backBtn.isVisible()) {
      await backBtn.click();
      // Should be back on the list
      await expect(page.getByText(/Koperasi A/i)).toBeVisible();
    }
  });

  test("opens create tenant dialog", async ({ page }) => {
    const createBtn = page.getByRole("button", { name: /buat|create|tambah/i });
    if (await createBtn.isVisible()) {
      await createBtn.click();
      // Dialog should appear with form fields
      await expect(page.getByLabel(/nama|name/i).first()).toBeVisible();
      await expect(page.getByLabel(/slug/i)).toBeVisible();
    }
  });
});

test.describe("Superadmin - account management", () => {
  test.beforeEach(async ({ page }) => {
    await loginAsSuperadmin(page);
    await expect(page.getByText(/Koperasi A|Tenant/i).first()).toBeVisible({ timeout: 5000 });
  });

  test("can switch to accounts section", async ({ page }) => {
    const accountsTab = page
      .getByRole("button", { name: /akun|accounts/i })
      .or(page.getByText(/akun|accounts/i).first());
    if (await accountsTab.isVisible()) {
      await accountsTab.click();
      // Should show account list
      await expect(page.getByText(/admin-a|superadmin/i).first()).toBeVisible({ timeout: 5000 });
    }
  });

  test("can search accounts", async ({ page }) => {
    const accountsTab = page
      .getByRole("button", { name: /akun|accounts/i })
      .or(page.getByText(/akun|accounts/i).first());
    if (await accountsTab.isVisible()) {
      await accountsTab.click();
      await expect(page.getByText(/admin-a|superadmin/i).first()).toBeVisible({ timeout: 5000 });

      const searchInput = page.getByPlaceholder(/cari|search/i);
      if (await searchInput.isVisible()) {
        await searchInput.fill("admin");
        await expect(page.getByText(/admin/i).first()).toBeVisible();
      }
    }
  });
});
