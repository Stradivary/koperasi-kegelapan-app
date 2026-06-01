import { test, expect, type Page } from "@playwright/test";

async function loginAsAdmin(page: Page) {
  await page.goto("/");
  await page.fill('[name="username"]', "admin-a");
  await page.fill('[name="password"]', "password");
  await page.click('button[type="submit"]');
  await expect(page).toHaveURL(/\/tenant\/.+\//);
}

test.describe("Admin navigation - sidebar tabs", () => {
  test.beforeEach(async ({ page }) => {
    await loginAsAdmin(page);
  });

  test("defaults to cards view after login", async ({ page }) => {
    await expect(page).toHaveURL(/\/cards/);
  });

  test("navigates to members tab", async ({ page }) => {
    await page.getByRole("link", { name: /anggota|members/i }).click();
    await expect(page).toHaveURL(/\/members/);
    await expect(page.getByText(/Tambah Anggota/i)).toBeVisible();
  });

  test("navigates to transactions tab", async ({ page }) => {
    await page.getByRole("link", { name: /transaksi|transactions/i }).click();
    await expect(page).toHaveURL(/\/transactions/);
    await expect(page.getByText(/Waktu|Card ID/i).first()).toBeVisible();
  });

  test("navigates to settings tab", async ({ page }) => {
    await page.getByRole("link", { name: /pengaturan|settings/i }).click();
    await expect(page).toHaveURL(/\/settings/);
    await expect(page.getByText(/Profil Tenant/i)).toBeVisible();
  });

  test("navigates back to cards from another tab", async ({ page }) => {
    await page.getByRole("link", { name: /anggota|members/i }).click();
    await expect(page).toHaveURL(/\/members/);

    await page.getByRole("link", { name: /kartu|cards/i }).click();
    await expect(page).toHaveURL(/\/cards/);
  });
});
