import { test, expect, type Page } from "@playwright/test";

async function loginAsAdmin(page: Page) {
  await page.goto("/");
  await page.fill('[name="username"]', "admin-a");
  await page.fill('[name="password"]', "password");
  await page.click('button[type="submit"]');
  await expect(page).toHaveURL(/\/tenant\/.+\//);
}

async function navigateToTransactions(page: Page) {
  await page.getByRole("link", { name: /transaksi|transactions/i }).click();
  await expect(page).toHaveURL(/\/transactions/);
}

test.describe("Transactions page", () => {
  test.beforeEach(async ({ page }) => {
    await loginAsAdmin(page);
    await navigateToTransactions(page);
  });

  test("renders transaction page with filter controls", async ({ page }) => {
    // Should show filter inputs
    await expect(page.getByLabel(/Card ID/i)).toBeVisible();
    await expect(page.getByLabel(/Tipe/i)).toBeVisible();
    await expect(page.getByLabel(/Dari/i)).toBeVisible();
    await expect(page.getByLabel(/Sampai/i)).toBeVisible();
  });

  test("shows empty state when no transactions match", async ({ page }) => {
    // Set date range to far past to ensure no results
    await page.fill("#filter-date-from", "2020-01-01");
    await page.fill("#filter-date-to", "2020-01-02");

    await expect(page.getByText(/Tidak ada transaksi/i)).toBeVisible({ timeout: 5000 });
  });

  test("card ID filter accepts input", async ({ page }) => {
    const cardIdInput = page.locator("#filter-card-id");
    await cardIdInput.fill("aabbccdd");
    await expect(cardIdInput).toHaveValue("aabbccdd");
  });

  test("type filter dropdown works", async ({ page }) => {
    // Open the type select
    await page.locator("#filter-type").click();
    // Should show filter options
    await expect(page.getByRole("option", { name: /Top-up/i })).toBeVisible();
    await expect(page.getByRole("option", { name: /Check-in/i })).toBeVisible();
    await expect(page.getByRole("option", { name: /Check-out/i })).toBeVisible();

    // Select a type
    await page.getByRole("option", { name: /Top-up/i }).click();
  });

  test("date range filter updates results", async ({ page }) => {
    const today = new Date().toISOString().split("T")[0];
    await page.fill("#filter-date-from", today);
    await page.fill("#filter-date-to", today);

    // Should either show transactions or empty state - no error
    await expect(
      page.getByText(/Tidak ada transaksi/i).or(page.locator("table, [role='table']")),
    ).toBeVisible({ timeout: 5000 });
  });

  test("reset button clears all filters", async ({ page }) => {
    // Apply some filters
    await page.locator("#filter-card-id").fill("test123");
    await page.fill("#filter-date-from", "2020-01-01");

    // Reset button should appear
    const resetBtn = page.getByRole("button", { name: /Reset/i });
    await expect(resetBtn).toBeVisible();
    await resetBtn.click();

    // Card ID filter should be cleared
    await expect(page.locator("#filter-card-id")).toHaveValue("");
  });
});
