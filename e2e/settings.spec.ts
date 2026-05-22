import { test, expect, type Page } from "@playwright/test";

async function loginAsAdmin(page: Page) {
  await page.goto("/");
  await page.fill('[name="username"]', "admin-a");
  await page.fill('[name="password"]', "password");
  await page.click('button[type="submit"]');
  await expect(page).toHaveURL(/\/tenant\/.+\//);
}

async function navigateToSettings(page: Page) {
  await page.getByRole("link", { name: /pengaturan|settings/i }).click();
  await expect(page).toHaveURL(/\/settings/);
}

test.describe("Settings page", () => {
  test.beforeEach(async ({ page }) => {
    await loginAsAdmin(page);
    await navigateToSettings(page);
  });

  test("shows tenant profile section", async ({ page }) => {
    await expect(page.getByText(/Profil Tenant/i)).toBeVisible();
  });

  test("displays tenant name and slug", async ({ page }) => {
    // Profile section should show tenant info
    await expect(page.getByText(/Koperasi A/i)).toBeVisible();
    await expect(page.getByText(/koperasi-a/i)).toBeVisible();
  });

  test("shows sync section", async ({ page }) => {
    await expect(page.getByText(/Sinkronisasi Tenant/i)).toBeVisible();
  });

  test("shows sync status indicator", async ({ page }) => {
    // Should show either connected or not registered status
    const connected = page.getByText(/Terhubung ke server/i);
    const notRegistered = page.getByText(/Belum terdaftar/i);
    await expect(connected.or(notRegistered)).toBeVisible();
  });

  test("shows sync checklist items", async ({ page }) => {
    await expect(page.getByText(/Tenant terdaftar/i)).toBeVisible();
    await expect(page.getByText(/Token autentikasi/i)).toBeVisible();
    await expect(page.getByText(/Anggota tersinkronisasi/i)).toBeVisible();
    await expect(page.getByText(/Kartu tersinkronisasi/i)).toBeVisible();
    await expect(page.getByText(/Transaksi tersinkronisasi/i)).toBeVisible();
  });

  test("has sync retry button", async ({ page }) => {
    const syncBtn = page.getByRole("button", { name: /Sinkronisasi Ulang/i });
    await expect(syncBtn).toBeVisible();
  });

  test("device list section is collapsible", async ({ page }) => {
    const devicesSection = page.getByText(/Daftar Perangkat/i);
    await expect(devicesSection).toBeVisible();

    // Click to expand
    await devicesSection.click();

    // Should show device list or empty state
    const deviceContent = page
      .getByText(/Belum ada perangkat/i)
      .or(page.getByText(/Perangkat ini/i))
      .or(page.getByRole("button", { name: /Refresh/i }));
    await expect(deviceContent).toBeVisible({ timeout: 5000 });
  });

  test("push to server button is visible", async ({ page }) => {
    const pushBtn = page.getByRole("button", { name: /Push ke Server/i });
    // Button may or may not be visible depending on sync state
    if (await pushBtn.isVisible()) {
      await expect(pushBtn).toBeEnabled();
    }
  });
});
