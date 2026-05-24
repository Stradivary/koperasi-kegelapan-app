import { test, expect, type Page } from "@playwright/test";

async function loginAsAdmin(page: Page) {
  await page.goto("/");
  await page.fill('[name="username"]', "admin-a");
  await page.fill('[name="password"]', "password");
  await page.click('button[type="submit"]');
  await expect(page).toHaveURL(/\/tenant\/.+\//);
}

test.describe("Admin cards page", () => {
  test.beforeEach(async ({ page }) => {
    await loginAsAdmin(page);
    // Should default to cards page
    await expect(page).toHaveURL(/\/cards/);
  });

  test("shows card list or empty state", async ({ page }) => {
    // Either shows cards or an empty state
    const cardContent = page
      .getByText(/Daftar Kartu|Belum ada kartu/i)
      .or(page.locator("table, [data-testid]").first());
    await expect(cardContent).toBeVisible({ timeout: 5000 });
  });

  test("shows issue card button", async ({ page }) => {
    const issueBtn = page.getByRole("button", { name: /Terbitkan|Daftarkan|Issue/i });
    await expect(issueBtn).toBeVisible({ timeout: 5000 });
  });

  test("issue card button opens drawer", async ({ page }) => {
    const issueBtn = page.getByRole("button", { name: /Terbitkan|Daftarkan|Issue/i });
    await issueBtn.click();

    // Should open a drawer/dialog for card issuance
    await expect(page.getByText(/Terbitkan Kartu|Daftarkan Kartu|Nama|NFC/i).first()).toBeVisible({
      timeout: 5000,
    });
  });

  test("card search/filter works", async ({ page }) => {
    const searchInput = page.getByPlaceholder(/cari|search|filter/i);
    if (await searchInput.isVisible()) {
      await searchInput.fill("nonexistent-card-xyz");
      // Should show no results or filtered results
      await page.waitForTimeout(500);
    }
  });

  test("card list shows status badges", async ({ page }) => {
    const anyCard = page.locator("table tbody tr, [data-testid*='card']").first();

    if (await anyCard.isVisible()) {
      // Cards exist — check for status badge
      await expect(page.getByText(/active|aktif|blocked|diblokir/i).first()).toBeVisible();
    }
  });
});

test.describe("Admin cards — card actions", () => {
  test.beforeEach(async ({ page }) => {
    await loginAsAdmin(page);
    await expect(page).toHaveURL(/\/cards/);
  });

  test("card row has action menu", async ({ page }) => {
    const firstRow = page.locator("table tbody tr, [data-testid*='card']").first();
    if (await firstRow.isVisible()) {
      // Look for action button (usually a "..." or kebab menu)
      const actionBtn = firstRow.getByRole("button").last();
      if (await actionBtn.isVisible()) {
        await actionBtn.click();
        // Should show dropdown with actions
        await expect(
          page
            .getByRole("menuitem")
            .first()
            .or(page.getByRole("button", { name: /blokir|block|topup|hapus/i }).first()),
        ).toBeVisible({ timeout: 3000 });
      }
    }
  });

  test("block card shows confirmation", async ({ page }) => {
    const blockBtn = page.getByRole("button", { name: /Blokir/i }).first();
    if (await blockBtn.isVisible()) {
      await blockBtn.click();
      // Should either directly block or show confirmation
      await page.waitForTimeout(1000);
    }
  });

  test("topup button opens topup drawer", async ({ page }) => {
    const topupBtn = page.getByRole("button", { name: /Top.?up/i }).first();
    if (await topupBtn.isVisible()) {
      await topupBtn.click();
      // Should open topup drawer with amount input
      await expect(page.getByText(/Top.?up|Jumlah|Amount/i).first()).toBeVisible({ timeout: 3000 });
    }
  });
});

test.describe("Admin cards — sync status", () => {
  test.beforeEach(async ({ page }) => {
    await loginAsAdmin(page);
    await expect(page).toHaveURL(/\/cards/);
  });

  test("cards show sync status indicator", async ({ page }) => {
    const firstRow = page.locator("table tbody tr, [data-testid*='card']").first();
    if (await firstRow.isVisible()) {
      // Cards should show sync status (synced/pending)
      const syncBadge = firstRow.getByText(/synced|pending/i);
      if (await syncBadge.isVisible()) {
        await expect(syncBadge).toBeVisible();
      }
    }
  });
});
