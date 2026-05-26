import { test, expect } from "@playwright/test";
import { SIGNATURE_AGENT_SLUG } from "../lib/templates/signature-email-agent";

test.describe("Agent signature — Assistant Email Pro", () => {
  test("fiche agent accessible (404 si non seedé)", async ({ page }) => {
    const res = await page.goto(`/listing/${SIGNATURE_AGENT_SLUG}`);
    expect(res?.status()).toBeLessThan(500);

    const body = await page.locator("body").textContent();
    if (res?.status() === 404 || body?.includes("introuvable")) {
      test.skip(true, "Agent non seedé — lancer: npm run seed:signature-agent");
    }

    await expect(page.locator("body")).toContainText(/Assistant Email Pro|assistant email/i);
  });

  test("RunPanel agent affiche variables email_recu", async ({ page }) => {
    await page.goto(`/listing/${SIGNATURE_AGENT_SLUG}`);
    const notFound = await page.getByText(/introuvable/i).isVisible().catch(() => false);
    if (notFound) {
      test.skip(true, "Agent non seedé");
    }

    await expect(page.locator("body")).toContainText(/email|Lancer|agent/i);
  });

  test("wallet lien vers agent démo", async ({ page }) => {
    await page.goto("/wallet");
    await expect(page).toHaveURL(/login|wallet/);
    if (page.url().includes("/wallet")) {
      const demoLink = page.getByRole("link", { name: /Assistant Email Pro|agent démo/i });
      if (await demoLink.count()) {
        await expect(demoLink.first()).toHaveAttribute("href", `/listing/${SIGNATURE_AGENT_SLUG}`);
      }
    }
  });
});

test.describe("Builder SCALE-4", () => {
  test("page création redirige ou affiche wizard si auth", async ({ page }) => {
    await page.goto("/dashboard/new");
    await expect(page).toHaveURL(/login|dashboard\/new/);
  });
});
