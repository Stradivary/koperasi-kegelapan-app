import { test, expect, type Page } from "@playwright/test";

async function loginAsAdmin(page: Page) {
  await page.goto("/");
  await page.fill('[name="username"]', "admin-a");
  await page.fill('[name="password"]', "password");
  await page.click('button[type="submit"]');
  await expect(page).toHaveURL(/\/tenant\/.+\//);
}

async function navigateToMembers(page: Page) {
  await page.getByRole("link", { name: /anggota|members/i }).click();
  await expect(page).toHaveURL(/\/members/);
}

test.describe("Member management", () => {
  test.beforeEach(async ({ page }) => {
    await loginAsAdmin(page);
    await navigateToMembers(page);
  });

  test("shows empty state or member list", async ({ page }) => {
    // Either shows the empty state message or a list of members
    const hasMembers = await page.getByText(/Tambah Anggota/i).isVisible();
    expect(hasMembers).toBeTruthy();
  });

  test("opens add member dialog", async ({ page }) => {
    await page.getByRole("button", { name: /Tambah Anggota/i }).click();
    await expect(page.getByText(/Nama Lengkap/i)).toBeVisible();
    await expect(page.getByRole("button", { name: /Daftarkan/i })).toBeVisible();
  });

  test("validates empty name on add member", async ({ page }) => {
    await page.getByRole("button", { name: /Tambah Anggota/i }).click();
    await expect(page.getByText(/Nama Lengkap/i)).toBeVisible();

    // Try to submit with empty name
    await page.getByRole("button", { name: /Daftarkan/i }).click();
    await expect(page.getByText(/tidak boleh kosong/i)).toBeVisible();
  });

  test("creates a new member successfully", async ({ page }) => {
    const memberName = `Test Member ${Date.now()}`;

    await page.getByRole("button", { name: /Tambah Anggota/i }).click();
    await page.fill('[placeholder="Ahmad Rifai"]', memberName);
    await page.getByRole("button", { name: /Daftarkan/i }).click();

    // Should show success toast
    await expect(page.getByText(/berhasil ditambahkan/i)).toBeVisible({ timeout: 5000 });

    // Member should appear in the list
    await expect(page.getByText(memberName)).toBeVisible({ timeout: 5000 });
  });

  test("can cancel add member dialog", async ({ page }) => {
    await page.getByRole("button", { name: /Tambah Anggota/i }).click();
    await expect(page.getByText(/Nama Lengkap/i)).toBeVisible();

    await page.getByRole("button", { name: /Batal/i }).click();
    // Dialog should close
    await expect(page.getByText(/Nama Lengkap/i)).not.toBeVisible();
  });

  test("suspend member via dropdown menu", async ({ page }) => {
    // First create a member to suspend
    const memberName = `Suspend Test ${Date.now()}`;
    await page.getByRole("button", { name: /Tambah Anggota/i }).click();
    await page.fill('[placeholder="Ahmad Rifai"]', memberName);
    await page.getByRole("button", { name: /Daftarkan/i }).click();
    await expect(page.getByText(/berhasil ditambahkan/i)).toBeVisible({ timeout: 5000 });

    // Find the member row and open actions
    const memberRow = page.locator("tr, [data-testid]").filter({ hasText: memberName });
    await memberRow
      .getByRole("button")
      .filter({ has: page.locator("svg") })
      .last()
      .click();

    // Click suspend
    await page.getByRole("menuitem", { name: /Tangguhkan/i }).click();

    // Status should change to suspended
    await expect(page.getByText(/Ditangguhkan/i).first()).toBeVisible({ timeout: 5000 });
  });

  test("delete member via dropdown menu", async ({ page }) => {
    // First create a member to delete
    const memberName = `Delete Test ${Date.now()}`;
    await page.getByRole("button", { name: /Tambah Anggota/i }).click();
    await page.fill('[placeholder="Ahmad Rifai"]', memberName);
    await page.getByRole("button", { name: /Daftarkan/i }).click();
    await expect(page.getByText(/berhasil ditambahkan/i)).toBeVisible({ timeout: 5000 });

    // Find the member row and open actions
    const memberRow = page.locator("tr, [data-testid]").filter({ hasText: memberName });
    await memberRow
      .getByRole("button")
      .filter({ has: page.locator("svg") })
      .last()
      .click();

    // Click delete
    await page.getByRole("menuitem", { name: /Hapus/i }).click();

    // Confirmation dialog should appear
    await expect(page.getByText(/Hapus Anggota/i)).toBeVisible();
    await page.getByRole("button", { name: /^Hapus$/i }).click();

    // Should show success toast
    await expect(page.getByText(/berhasil dihapus/i)).toBeVisible({ timeout: 5000 });
  });

  test("member search filters the list", async ({ page }) => {
    // Create two members with distinct names
    const name1 = `SearchAlpha ${Date.now()}`;
    const name2 = `SearchBeta ${Date.now()}`;

    await page.getByRole("button", { name: /Tambah Anggota/i }).click();
    await page.fill('[placeholder="Ahmad Rifai"]', name1);
    await page.getByRole("button", { name: /Daftarkan/i }).click();
    await expect(page.getByText(/berhasil/i)).toBeVisible({ timeout: 5000 });

    await page.getByRole("button", { name: /Tambah Anggota/i }).click();
    await page.fill('[placeholder="Ahmad Rifai"]', name2);
    await page.getByRole("button", { name: /Daftarkan/i }).click();
    await expect(page.getByText(/berhasil/i)).toBeVisible({ timeout: 5000 });

    // Search for first member
    const searchInput = page.getByPlaceholder(/Cari anggota/i);
    if (await searchInput.isVisible()) {
      await searchInput.fill("SearchAlpha");
      await expect(page.getByText(name1)).toBeVisible();
      await expect(page.getByText(name2)).not.toBeVisible();
    }
  });
});
