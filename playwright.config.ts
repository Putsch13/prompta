import { defineConfig, devices } from "@playwright/test";

export default defineConfig({
  testDir: "./e2e",
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  use: {
    baseURL: process.env.PLAYWRIGHT_BASE_URL || "http://localhost:3000",
    trace: "on-first-retry",
  },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
  // En CI on sert le BUILD (npm start), pas le dev server : c'est l'artefact
  // qu'on déploie. `webServer: undefined` en CI laissait la suite viser un
  // port où rien n'écoutait — une des raisons pour lesquelles elle n'y a
  // jamais tourné. PLAYWRIGHT_BASE_URL pointant ailleurs (staging), on
  // n'en démarre aucun.
  webServer: process.env.PLAYWRIGHT_EXTERNAL_URL
    ? undefined
    : {
        command: process.env.CI ? "npm start" : "npm run dev",
        url: "http://localhost:3000",
        reuseExistingServer: !process.env.CI,
        timeout: 120_000,
      },
});
