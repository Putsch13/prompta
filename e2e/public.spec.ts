import { test, expect } from "@playwright/test";

test.describe("Prompta — parcours public", () => {
  test("accueil charge et affiche le header", async ({ page }) => {
    await page.goto("/");
    await expect(page).toHaveTitle(/Prompta/i);
    await expect(page.getByRole("link", { name: /explorer|prompta/i }).first()).toBeVisible();
  });

  test("page login accessible", async ({ page }) => {
    await page.goto("/login");
    await expect(page.getByRole("heading", { name: /connexion/i })).toBeVisible();
    await expect(page.getByRole("button", { name: /google/i })).toBeVisible();
    await expect(page.getByRole("button", { name: /microsoft/i })).toBeVisible();
  });

  test("page explore liste des prompts", async ({ page }) => {
    await page.goto("/explore");
    await expect(page.locator("body")).toContainText(/prompt|agent|explorer/i);
  });

  test("pages légales accessibles", async ({ page }) => {
    await page.goto("/legal/terms");
    await expect(page.locator("body")).toContainText(/conditions|terms|prompta/i);
    await page.goto("/legal/privacy");
    await expect(page.locator("body")).toContainText(/confidentialité|privacy|données/i);
  });
});
