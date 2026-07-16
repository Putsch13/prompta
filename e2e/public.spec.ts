import { test, expect } from "@playwright/test";

test.describe("Prompta — parcours public", () => {
  test("accueil charge et affiche le header", async ({ page }) => {
    await page.goto("/");
    await expect(page).toHaveTitle(/Prompta/i);
    await expect(page.getByRole("link", { name: /^Prompta$/i }).first()).toBeVisible();
    await expect(page.getByRole("heading", { level: 1 })).toContainText(/voit ton écran/i);
  });

  test("page login accessible", async ({ page }) => {
    await page.goto("/login");
    await expect(page.getByRole("heading", { name: /connexion/i })).toBeVisible();
    await expect(page.getByRole("button", { name: /google/i })).toBeVisible();
    await expect(page.getByRole("button", { name: /microsoft/i })).toBeVisible();
  });

  test("marketplace dépubliée — /explore, /c et /u redirigent vers l'accueil", async ({ page }) => {
    await page.goto("/explore");
    await expect(page).toHaveURL(/\/$/);
    await page.goto("/c/productivite");
    await expect(page).toHaveURL(/\/$/);
    await page.goto("/u/demo");
    await expect(page).toHaveURL(/\/$/);
  });

  test("pages légales accessibles", async ({ page }) => {
    await page.goto("/legal/terms");
    await expect(page.locator("body")).toContainText(/conditions|terms|prompta/i);
    await page.goto("/legal/privacy");
    await expect(page.locator("body")).toContainText(/confidentialité|privacy|données/i);
  });

  test("page wallet accessible (redirige si non connecté)", async ({ page }) => {
    await page.goto("/wallet");
    await expect(page).toHaveURL(/login|wallet/);
  });

  test("API health — run agent refuse sans auth", async ({ request }) => {
    const res = await request.post("/api/run/agent", {
      data: { listingId: "00000000-0000-0000-0000-000000000000", versionId: "00000000-0000-0000-0000-000000000000" },
    });
    expect(res.status()).toBe(401);
  });

  test("dashboard redirige vers login si non connecté (gate proxy)", async ({ page }) => {
    await page.goto("/dashboard");
    await expect(page).toHaveURL(/\/login\?redirect=%2Fdashboard/);
  });

  test("APIs sensibles refusent sans auth", async ({ request }) => {
    for (const path of ["/api/approvals", "/api/connectors", "/api/keys", "/api/credits"]) {
      const res = await request.get(path);
      expect(res.status(), path).toBe(401);
    }
  });

  test("cron tick refuse sans secret (fail-closed)", async ({ request }) => {
    const res = await request.get("/api/cron/tick");
    expect(res.status()).toBe(401);
    const bad = await request.get("/api/cron/tick", {
      headers: { authorization: "Bearer undefined" },
    });
    expect(bad.status()).toBe(401);
  });
});

test("pricing — page publique avec les 4 plans et JSON-LD", async ({ page }) => {
  await page.goto("/pricing");
  await expect(page.getByRole("heading", { level: 1 })).toContainText(/gratuitement/i);
  for (const plan of ["Découverte", "Starter", "Pro", "Scale"]) {
    await expect(page.getByRole("heading", { name: plan, exact: true })).toBeVisible();
  }
  const jsonLd = await page.locator('script[type="application/ld+json"]').first().textContent();
  expect(jsonLd).toContain("FAQPage");
  expect(jsonLd).toContain("SoftwareApplication");
});
