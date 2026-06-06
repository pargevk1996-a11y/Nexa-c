import { test, expect } from "@playwright/test";

test.describe("Guest access", () => {
  test("redirects unauthenticated user from chats to login", async ({ page }) => {
    await page.goto("/app/chats");
    await expect(page).toHaveURL(/\/login/);
  });

  test("login page renders email and password fields", async ({ page }) => {
    await page.goto("/login");
    await expect(page.getByRole("textbox", { name: /email/i })).toBeVisible();
    await expect(page.locator('input[type="password"]')).toBeVisible();
  });

  test("settings route requires auth", async ({ page }) => {
    await page.goto("/app/settings");
    await expect(page).toHaveURL(/\/login/);
  });
});
