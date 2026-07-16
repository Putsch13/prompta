import { test, expect } from "@playwright/test";

test.describe("Surfaces builder / listing coupées", () => {
  test("fiche listing publique redirige vers l'accueil", async ({ page }) => {
    await page.goto("/listing/assistant-email-pro");
    await expect(page).toHaveURL(/\/$/);
  });

  test("wallet accessible ou login (plus de lien listing requis)", async ({ page }) => {
    await page.goto("/wallet");
    await expect(page).toHaveURL(/login|wallet/);
  });

  test("page création agent redirige vers login ou runs", async ({ page }) => {
    await page.goto("/dashboard/new");
    await expect(page).toHaveURL(/login|dashboard\/runs/);
  });
});
