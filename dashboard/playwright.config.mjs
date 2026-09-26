// Playwright e2e — runs against a dev server already listening on :3100 (`npm run dev`).
//   npx playwright test            (all)      ·   npx playwright test tests/e2e/new-project.spec.mjs
// Node unit tests stay on `npm test` (node --test); this config only picks up tests/e2e.
import { defineConfig } from "@playwright/test";
export default defineConfig({
  testDir: "./tests/e2e",
  timeout: 60_000,
  retries: 0,
  use: { baseURL: process.env.BASE_URL || "http://localhost:3100", headless: true, viewport: { width: 1280, height: 900 } },
  reporter: [["list"]],
});
