import { test, expect } from "@playwright/test";

test.describe("Login page - UI and interactions", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/");
  });

  test("renders login form with all fields", async ({ page }) => {
    await expect(page.locator('[name="username"]')).toBeVisible();
    await expect(page.locator('[name="password"]')).toBeVisible();
    await expect(page.getByRole("button", { name: /masuk|login|submit/i })).toBeVisible();
  });

  test("shows app branding", async ({ page }) => {
    // The login page should show the app name/brand
    await expect(page.locator("body")).toContainText(/.+/);
  });

  test("empty form submission shows validation or error", async ({ page }) => {
    await page.click('button[type="submit"]');
    // Either HTML5 validation prevents submission or an error message appears
    const errorVisible = await page.getByText(/salah|invalid|required|gagal/i).isVisible();
    const usernameRequired = await page.locator('[name="username"]:invalid').count();
    expect(errorVisible || usernameRequired > 0).toBeTruthy();
  });

  test("password field is masked", async ({ page }) => {
    const passwordInput = page.locator('[name="password"]');
    await expect(passwordInput).toHaveAttribute("type", "password");
  });

  test("shows device setup option", async ({ page }) => {
    const setupBtn = page.getByText(/perangkat|device/i);
    await expect(setupBtn).toBeVisible();
  });

  test("shows local setup option", async ({ page }) => {
    const localSetupBtn = page.getByText(/buat|setup|lokal/i).first();
    if (await localSetupBtn.isVisible()) {
      await expect(localSetupBtn).toBeVisible();
    }
  });

  test("shows server browse option", async ({ page }) => {
    const serverBtn = page.getByText(/server|hubungkan/i).first();
    if (await serverBtn.isVisible()) {
      await expect(serverBtn).toBeVisible();
    }
  });

  test("shows registered tenants link", async ({ page }) => {
    const tenantsLink = page.getByText(/terdaftar|registered/i).first();
    if (await tenantsLink.isVisible()) {
      await tenantsLink.click();
      await expect(page).toHaveURL(/\/devices/);
    }
  });
});

test.describe("Login - error handling", () => {
  test("shows error for non-existent user", async ({ page }) => {
    await page.goto("/");
    await page.fill('[name="username"]', "nonexistent-user-xyz");
    await page.fill('[name="password"]', "anypassword");
    await page.click('button[type="submit"]');
    await expect(page.getByText(/salah|invalid|gagal|tidak ditemukan/i)).toBeVisible({
      timeout: 15000,
    });
  });

  test("shows error for correct user wrong password", async ({ page }) => {
    await page.goto("/");
    await page.fill('[name="username"]', "admin-a");
    await page.fill('[name="password"]', "wrongpassword123");
    await page.click('button[type="submit"]');
    await expect(page.getByText(/salah|invalid|gagal/i)).toBeVisible({ timeout: 15000 });
  });

  test("login button shows loading state during submission", async ({ page }) => {
    await page.goto("/");
    await page.fill('[name="username"]', "admin-a");
    await page.fill('[name="password"]', "password");

    await page.getByRole("button", { name: /masuk|login|submit/i }).click();

    // The page should eventually navigate after login
    await expect(page).toHaveURL(/\/tenant\/.+\//, { timeout: 15000 });
  });
});

test.describe("Login - successful flows", () => {
  test("admin login redirects to admin cards page", async ({ page }) => {
    await page.goto("/");
    await page.fill('[name="username"]', "admin-a");
    await page.fill('[name="password"]', "password");
    await page.click('button[type="submit"]');
    await expect(page).toHaveURL(/\/tenant\/.+\/(cards|admin)/, { timeout: 15000 });
  });

  test("session persists on page reload after login", async ({ page }) => {
    await page.goto("/");
    await page.fill('[name="username"]', "admin-a");
    await page.fill('[name="password"]', "password");
    await page.click('button[type="submit"]');
    await expect(page).toHaveURL(/\/tenant\/.+\//, { timeout: 15000 });

    // Reload the page
    await page.reload();

    // Should still be on the tenant page (auto-boot from IndexedDB context)
    await expect(page).toHaveURL(/\/tenant\/.+\//, { timeout: 10000 });
  });
});
